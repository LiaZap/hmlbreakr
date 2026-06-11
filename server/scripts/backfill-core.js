'use strict';
/**
 * backfill-core.js — F1 do refactor JSON → tabelas.
 *
 * Lê o blob `Client.data` (via Prisma) e popula as tabelas normalizadas novas
 * (via Drizzle). Idempotente por cliente (use --wipe pra reprocessar).
 *
 * RODE SEMPRE NUMA CÓPIA LOCAL DE PRODUÇÃO (ver scripts/prod-to-local.mjs).
 * DATABASE_URL deve apontar pro banco LOCAL. Nunca rode contra produção direto.
 *
 * Modos:
 *   --inspect            mostra a FORMA real dos dados (chaves de ficha/insumo/formData)
 *                        — use pra confirmar o mapeamento contra dados reais
 *   --dry-run            simula e valida somas, NÃO grava
 *   --wipe               limpa as tabelas novas do cliente antes de inserir
 *   --client=<hash|id>   processa só um cliente (piloto: o hash do italico)
 *   (sem flag)           grava
 *
 * Ex.:  node scripts/backfill-core.js --inspect --client=<hash>
 *       node scripts/backfill-core.js --dry-run
 *       node scripts/backfill-core.js --wipe --client=<hash>
 */
require('dotenv').config();
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { eq } = require('drizzle-orm');
const { db, pool } = require('../src/db/client');
const s = require('../src/db/schema');

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const DRY = has('--dry-run');
const INSPECT = has('--inspect');
const WIPE = has('--wipe');
const ONLY = opt('client');

const uuid = () => crypto.randomUUID();
const first = (...vals) => vals.find((v) => v !== undefined && v !== null);

// "R$ 1.234,56" / "1.234,56" / "1234.56" / 1234.56 → "1234.56" (string p/ numeric) | null
function money(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? String(v) : null;
  let str = String(v).replace(/R\$/g, '').trim();
  if (str.includes(',') && str.includes('.')) str = str.replace(/\./g, '').replace(',', '.');
  else if (str.includes(',')) str = str.replace(',', '.');
  str = str.replace(/[^0-9.\-]/g, '');
  const n = parseFloat(str);
  return isFinite(n) ? String(n) : null;
}
const intOrNull = (v) => { const n = parseInt(v, 10); return isFinite(n) ? n : null; };
const boolish = (v) => v === true || v === 'true' || v === 'Sim' || v === 'sim';

async function insertMany(table, rows) {
  if (!rows.length) return 0;
  if (DRY) return rows.length;
  // insere em lotes pra não estourar parâmetros
  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(table).values(rows.slice(i, i + 500));
  }
  return rows.length;
}

async function wipeClient(clientId) {
  // ordem FK-safe: sheets cascateiam items/modules/options
  await db.delete(s.technicalSheet).where(eq(s.technicalSheet.clientId, clientId));
  for (const t of [s.ingredient, s.menuItem, s.revenueEntry, s.dailyRevenue, s.companyProfile,
    s.fixedCostItem, s.employee, s.partner, s.equipment, s.vehicle, s.cardMachine, s.marketplace, s.metricSnapshot]) {
    await db.delete(t).where(eq(t.clientId, clientId));
  }
}

function inspect(client, data) {
  const fd = data.formData || {};
  const fichas = data.operational?.fichas || [];
  const insumos = data.operational?.insumos || [];
  console.log(`\n── INSPECT cliente ${client.name} (${client.hash}) ──`);
  console.log('top-level keys:', Object.keys(data).join(', '));
  console.log(`insumos: ${insumos.length} · fichas: ${fichas.length} · menu: ${(data.menuEngineering || []).length}`);
  if (insumos[0]) console.log('insumo[0] keys:', Object.keys(insumos[0]).join(', '));
  const fSimple = fichas.find((f) => !f.isModular);
  const fMod = fichas.find((f) => f.isModular);
  if (fSimple) console.log('ficha simples[0] keys:', Object.keys(fSimple).join(', '));
  const fsItems = fSimple ? ([fSimple.ingredients, fSimple.insumos, fSimple.itens, fSimple.items].find(Array.isArray) || []) : [];
  if (fsItems[0]) console.log('ficha item[0] keys:', Object.keys(fsItems[0]).join(', '));
  if (fMod) console.log('ficha modular[0] keys:', Object.keys(fMod).join(', '));
  const fmMod = fMod && Array.isArray(fMod.modules) ? fMod.modules[0] : null;
  if (fmMod) console.log('modulo[0] keys:', Object.keys(fmMod).join(', '), '· option[0]:', fmMod.options?.[0] ? Object.keys(fmMod.options[0]).join(', ') : '—');
  console.log('formData keys:', Object.keys(fd).join(', '));
  if ((data.menuEngineering || [])[0]) console.log('menu[0] keys:', Object.keys(data.menuEngineering[0]).join(', '));
}

async function backfillClient(client) {
  let data;
  try { data = JSON.parse(client.data || '{}'); } catch { console.warn(`  [skip] ${client.hash}: data inválido`); return null; }
  if (INSPECT) { inspect(client, data); return null; }

  const cid = client.id;
  if (WIPE && !DRY) await wipeClient(cid);

  const op = data.operational || {};
  const fd = data.formData || {};
  const counts = {};

  // 1) Insumos → Ingredient (mapa legacyId → id)
  const ingMap = {};
  const ingRows = (op.insumos || []).map((it) => {
    const id = uuid();
    if (it.id != null) ingMap[String(it.id)] = id;
    return {
      id, clientId: cid, legacyId: it.id != null ? String(it.id) : null,
      name: first(it.nome, it.name) || 'Insumo',
      category: first(it.categoria, it.category) || null,
      unit: first(it.unidade, it.unidadeMedida, it.unit) || null,
      packPrice: money(first(it.purchaseTotal, it.precoEmbalagem, it.packPrice)),
      packQty: money(first(it.purchaseQty, it.qtdEmbalagem, it.packQty)),
      unitCost: money(first(it.custo, it.custoUnitario, it.precoUnitario, it.unitCost)),
    };
  });
  counts.ingredient = await insertMany(s.ingredient, ingRows);

  // 2) Fichas pass 1 → TechnicalSheet (mapa fichaLegacyId → sheetId)
  const sheetMap = {};
  const sheetRows = (op.fichas || []).map((f) => {
    const id = uuid();
    if (f.id != null) sheetMap[String(f.id)] = id;
    return {
      id, clientId: cid, legacyId: f.id != null ? String(f.id) : null,
      name: first(f.nome, f.name) || 'Ficha',
      category: first(f.categoria, f.category, f.type) || null,
      isModular: !!f.isModular,
      yield: money(first(f.rendimento, f.yield)),
      sellingPrice: money(first(f.precoVenda, f.sellingPrice)),
      totalCost: money(first(f.custoTotal, f.totalCost)),
      costMin: money(f.custoMin), costMax: money(f.custoMax),
    };
  });
  counts.technicalSheet = await insertMany(s.technicalSheet, sheetRows);

  // 3) Fichas pass 2 → itens (simples) ou módulos+opções (modular)
  const itemRows = []; const moduleRows = []; const optionRows = [];
  for (const f of (op.fichas || [])) {
    const sheetId = sheetMap[String(f.id)];
    if (!sheetId) continue;
    if (f.isModular) {
      for (const m of (f.modules || [])) {
        const moduleId = uuid();
        moduleRows.push({ id: moduleId, sheetId, legacyId: m.id != null ? String(m.id) : null, name: first(m.nome, m.name) || 'Módulo', required: m.required !== false });
        for (const o of (m.options || [])) {
          optionRows.push({
            id: uuid(), moduleId, legacyId: o.id != null ? String(o.id) : null,
            name: first(o.nome, o.name) || 'Opção',
            cost: money(first(o.custo, o.cost)),
            isDefault: !!(o.default || o.isDefault),
            linkedSheetId: o.linkedFichaId != null ? (sheetMap[String(o.linkedFichaId)] || null) : null,
          });
        }
      }
    } else {
      const items = [f.ingredients, f.insumos, f.itens, f.items].find(Array.isArray) || [];
      for (const it of items) {
        const qty = money(first(it.qty, it.qtd, it.quantidade, it.quantity)) || '0';
        const line = money(first(it.custo, it.custoTotal, it.lineCost)) || '0';   // custo do item = custo da linha
        const unitCost = money(first(it.price, it.custoUnitario, it.unitCost))
          || (parseFloat(qty) ? String(parseFloat(line) / parseFloat(qty)) : '0');
        itemRows.push({
          id: uuid(), sheetId,
          ingredientId: first(it.insumoId, it.id) != null ? (ingMap[String(first(it.insumoId, it.id))] || null) : null,
          description: first(it.nome, it.descricao, it.name, it.description) || 'Item',
          quantity: qty, unit: first(it.unit, it.unidade) || null,
          unitCost, lineCost: line,
        });
      }
    }
  }
  counts.sheetItem = await insertMany(s.technicalSheetItem, itemRows);
  counts.sheetModule = await insertMany(s.sheetModule, moduleRows);
  counts.sheetOption = await insertMany(s.sheetModuleOption, optionRows);

  // 4) Menu engineering → MenuItem
  const menuRows = (data.menuEngineering || []).map((m) => ({
    id: uuid(), clientId: cid, legacyId: m.id != null ? String(m.id) : null,
    sheetId: m.fichaId != null ? (sheetMap[String(m.fichaId)] || null) : null,
    name: first(m.nome, m.name) || 'Item',
    category: first(m.categoria, m.category, m.type) || null,
    salesEstimate: money(first(m.sales, m.vendas)),
    price: money(m.price ?? m.preco), cost: money(m.cost ?? m.custo),
  }));
  counts.menuItem = await insertMany(s.menuItem, menuRows);

  // 5) Faturamento mensal (revenue_history "MM/AAAA")
  const revRows = [];
  for (const e of (fd.revenue_history || [])) {
    if (!e?.month) continue;
    const [mm, yyyy] = String(e.month).split('/');
    const month = intOrNull(mm); const year = intOrNull(yyyy);
    const amount = money(e.amount);
    if (month && year && amount !== null) revRows.push({ id: uuid(), clientId: cid, year, month, amount, source: 'onboarding' });
  }
  counts.revenue = await insertMany(s.revenueEntry, revRows);

  // 6) Faturamento diário (daily_revenue { "YYYY-MM-DD": valor })
  const dailyRows = Object.entries(fd.daily_revenue || {}).map(([date, v]) => ({
    id: uuid(), clientId: cid, date, amount: money(v), source: 'manual',
  })).filter((r) => r.amount !== null);
  counts.daily = await insertMany(s.dailyRevenue, dailyRows);

  // 7) Company profile (1:1)
  const profileRows = [{
    id: uuid(), clientId: cid,
    restaurantName: first(data.restaurant?.name, fd.identity?.company_name),
    restaurantCategory: first(data.restaurant?.category, fd.identity?.category),
    taxRegime: fd.identity?.tax_regime || null,
    isMei: boolish(fd.identity?.is_mei),
    simplesRate: money(fd.admin_systems?.simples_rate),
    rentMonthly: money(fd.location_costs?.rent),
    iptuAnnual: money(fd.location_costs?.iptu_annual),
  }];
  counts.profile = await insertMany(s.companyProfile, profileRows);

  // 8) Custos fixos genéricos → FixedCostItem
  const costRows = [];
  const pushCost = (group, key, val, label) => { const a = money(val); if (a !== null && parseFloat(a) !== 0) costRows.push({ id: uuid(), clientId: cid, costGroup: group, costKey: key, label: label || key, amount: a }); };
  if (fd.location_costs) pushCost('location', 'rent', fd.location_costs.rent, 'Aluguel');
  for (const k of ['energy', 'water', 'internet', 'telefone', 'security', 'security_guard']) pushCost('utilities', k, fd.utilities?.[k]);
  for (const k of ['pest_control', 'waste_removal', 'cleaning_supplies']) pushCost('recurring', k, fd.recurring_services?.[k]);
  for (const k of ['kitchen_gas', 'kitchen_oil', 'disposables']) pushCost('operational', k, fd.operational_fixed?.[k]);
  for (const k of ['software_pdv', 'accountant', 'card_machine_rent', 'taxes_das']) pushCost('admin', k, fd.admin_systems?.[k]);
  for (const k of ['agency', 'ads_budget']) pushCost('marketing', k, fd.marketing_structure?.[k]);
  for (const it of (fd.monthly_services || [])) pushCost('monthly_service', null, it.value, first(it.name, it.label));
  for (const it of (fd.other_fixed_costs || [])) pushCost('other', null, it.value, first(it.name, it.label));
  counts.fixedCost = await insertMany(s.fixedCostItem, costRows);

  // 9) Employees / Partners / Equipment / Vehicles / Cards / Marketplaces
  counts.employee = await insertMany(s.employee, (fd.employees || []).map((e) => ({
    id: uuid(), clientId: cid, legacyId: e.id != null ? String(e.id) : null,
    name: e.name || null, regime: e.regime || null,
    baseSalary: money(e.base_salary), bonus: money(e.premio),
    transportValue: money(e.transport_value), transportQty: intOrNull(e.transport_qty),
    workDays: intOrNull(e.work_days), foodCost: money(e.food_cost),
  })));
  counts.partner = await insertMany(s.partner, (fd.partners || []).map((p) => ({
    id: uuid(), clientId: cid, name: p.name || null, proLabore: money(p.pro_labore),
    personalAccountBank: p.personal_bank || null, personalAccountAgency: p.personal_agency || null, personalAccountNumber: p.personal_account || null,
  })));
  counts.equipment = await insertMany(s.equipment, (fd.equipment || []).map((e) => ({
    id: uuid(), clientId: cid, name: first(e.name, e.description) || null, value: money(e.value), lifespanYears: money(e.lifespan) || '5',
  })));
  counts.vehicle = await insertMany(s.vehicle, (fd.vehicles || []).map((v) => ({
    id: uuid(), clientId: cid, description: first(v.name, v.description) || null,
    installment: money(v.installment), maintenanceMonthly: money(v.maintenance_monthly),
    insuranceAnnual: money(v.insurance_annual), ipvaAnnual: money(v.ipva_annual),
  })));
  counts.cardMachine = await insertMany(s.cardMachine, (fd.fees_cards || []).map((c) => ({
    id: uuid(), clientId: cid, provider: first(c.provider, c.name) || null,
    debitRate: money(String(c.debit_rate || '').replace('%', '')), creditRate: money(String(c.credit_rate || '').replace('%', '')),
  })));
  counts.marketplace = await insertMany(s.marketplace, (fd.fees_marketplaces || []).map((m) => ({
    id: uuid(), clientId: cid, provider: m.provider || null, customProvider: m.custom_provider || null,
    commission: money(String(m.commission || '').replace('%', '')), salesPercentage: money(String(m.sales_percentage || '').replace('%', '')),
    monthlyFee: money(m.monthly_fee),
  })));
  counts.metricSnapshot = await insertMany(s.metricSnapshot, Object.entries(fd.metric_snapshots || {}).map(([periodKey, drivers]) => ({
    id: uuid(), clientId: cid, periodKey, drivers,
  })));

  // ── Validação (somas batem com o blob?) ──
  const blobRevTotal = (fd.revenue_history || []).reduce((a, e) => a + (parseFloat(money(e.amount)) || 0), 0)
    + Object.values(fd.daily_revenue || {}).reduce((a, v) => a + (parseFloat(money(v)) || 0), 0);
  const tabRevTotal = revRows.reduce((a, r) => a + parseFloat(r.amount), 0) + dailyRows.reduce((a, r) => a + parseFloat(r.amount), 0);
  const revOk = Math.abs(blobRevTotal - tabRevTotal) < 0.01;

  return {
    client: client.hash,
    counts,
    validation: {
      insumos: { blob: (op.insumos || []).length, tab: counts.ingredient, ok: (op.insumos || []).length === counts.ingredient },
      fichas: { blob: (op.fichas || []).length, tab: counts.technicalSheet, ok: (op.fichas || []).length === counts.technicalSheet },
      menu: { blob: (data.menuEngineering || []).length, tab: counts.menuItem, ok: (data.menuEngineering || []).length === counts.menuItem },
      revenueTotal: { blob: blobRevTotal.toFixed(2), tab: tabRevTotal.toFixed(2), ok: revOk },
    },
  };
}

async function main() {
  console.log(`=== backfill-core ${DRY ? '[DRY-RUN]' : ''}${INSPECT ? '[INSPECT]' : ''}${WIPE ? '[WIPE]' : ''} ===`);

  // TRAVA DE SEGURANÇA: este script é LOCAL-ONLY. Nunca migra/escreve em produção.
  // O banco de destino (DATABASE_URL) precisa ser local. Override consciente: --allow-remote.
  const dbUrl = process.env.DATABASE_URL || '';
  const isLocal = /@(localhost|127\.0\.0\.1|host\.docker\.internal)\b/.test(dbUrl);
  if (!isLocal && !has('--allow-remote')) {
    console.error('\nABORTADO: DATABASE_URL não parece LOCAL. Este script só migra na CÓPIA LOCAL.');
    console.error(`  DATABASE_URL host = ${(dbUrl.match(/@([^/:]+)/) || [])[1] || '(?)'}`);
    console.error('  Use a cópia local (porta 5433). Para rodar contra remoto (NÃO recomendado): --allow-remote.');
    process.exit(1);
  }
  const where = ONLY ? { OR: [{ hash: ONLY }, { id: ONLY }] } : {};
  // Busca só os ids primeiro; carrega o blob (até dezenas de MB) UM por vez → memória constante.
  const list = await prisma.client.findMany({ where, select: { id: true, hash: true, name: true } });
  console.log(`Clientes: ${list.length}`);

  const reports = [];
  for (const meta of list) {
    const c = await prisma.client.findUnique({ where: { id: meta.id }, select: { id: true, hash: true, name: true, data: true } });
    if (!c) continue;
    const r = await backfillClient(c);
    if (r) reports.push(r);
  }

  if (!INSPECT) {
    let problems = 0;
    for (const r of reports) {
      const v = r.validation;
      const bad = Object.entries(v).filter(([, x]) => !x.ok);
      const tag = bad.length ? '⚠️ ' : 'OK ';
      console.log(`${tag}${r.client}  insumos=${v.insumos.tab} fichas=${v.fichas.tab} menu=${v.menu.tab} rev=${v.revenueTotal.tab}`);
      if (bad.length) { problems++; bad.forEach(([k, x]) => console.log(`    ✗ ${k}: blob=${x.blob} tab=${x.tab}`)); }
    }
    console.log(`\n${DRY ? '[DRY] ' : ''}Concluído. ${reports.length} clientes, ${problems} com divergência.`);
    if (DRY) console.log('Nada gravado (dry-run). Rode sem --dry-run para persistir.');
  }
}

main()
  .catch((e) => { console.error('Falha:', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
