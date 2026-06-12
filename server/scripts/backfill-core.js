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

// modifiedBy de toda linha migrada (proveniência — regra "quem alterou" da base)
const MODIFIED_BY = 'backfill:F1';
// "1000kg" → {value:'1000', unit:'kg'} ; "0,5 L" → {'0.5','L'} ; "" → {null,null}
function parseYield(v) {
  if (v == null || v === '') return { value: null, unit: null };
  const m = String(v).trim().match(/^\s*(-?[\d.,]+)\s*([^\d.,\s]*)/);
  if (!m) return { value: null, unit: null };
  return { value: money(m[1]), unit: (m[2] || '').trim() || null };
}
// epoch ms (number/string) → Date ; senão null (p/ sourceCreatedAt/sourceUpdatedAt)
function epochToDate(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  if (!isFinite(n) || n <= 0) return null;
  const d = new Date(n);
  return isNaN(d.getTime()) ? null : d;
}
// normaliza nome p/ match cross-ORM (lower, sem acento, trim)
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// só guarda a string se for URL http(s); base64/data-uri fica no blob (não infla a tabela nem o dump)
const urlOnly = (v) => (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) ? v.trim() : null;

// Caminha a árvore de subIngredients do insumo preparado → IngredientComponent.
// rootIngredientId = o insumo preparado raiz; parentId = componente pai (aninhado).
// ingMap mapeia legacyId do insumo → Ingredient.id (link opcional ao insumo base).
function emitComponents(list, rootIngredientId, parentId, ingMap, out) {
  let pos = 0;
  for (const c of (Array.isArray(list) ? list : [])) {
    const compId = uuid();
    out.push({
      id: compId, ingredientId: rootIngredientId, parentComponentId: parentId,
      componentIngredientId: c.id != null ? (ingMap[String(c.id)] || null) : null,
      legacyId: c.id != null ? String(c.id) : null,
      name: first(c.name, c.nome) || 'Componente',
      category: first(c.category, c.categoria) || null,
      qty: money(first(c.qty, c.quantidade)), unit: c.unit || null,
      unitCost: money(c.price), lineCost: money(c.custo),
      isPrepared: boolish(c.isPrepared), position: ++pos,
      modifiedBy: MODIFIED_BY,
    });
    if (Array.isArray(c.subIngredients) && c.subIngredients.length) {
      emitComponents(c.subIngredients, rootIngredientId, compId, ingMap, out);
    }
  }
}

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
  // ordem FK-safe: sheets cascateiam items/modules/options/steps
  await db.delete(s.technicalSheet).where(eq(s.technicalSheet.clientId, clientId));
  // category POR ÚLTIMO: Ingredient/TechnicalSheet/MenuItem.categoryId → set null
  // ao apagar antes; assim não há churn de FK.
  for (const t of [s.ingredient, s.menuItem, s.revenueEntry, s.dailyRevenue, s.companyProfile,
    s.fixedCostItem, s.employee, s.partner, s.equipment, s.vehicle, s.cardMachine, s.marketplace,
    s.metricSnapshot, s.category]) {
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

  // ── Dump dirigido p/ F0.5 (confirmar chaves reais antes de criar colunas) ──
  const dump = (label, obj, cap = 700) => {
    if (obj === undefined) { console.log(`  ${label}: <ausente>`); return; }
    let str; try { str = JSON.stringify(obj); } catch { str = String(obj); }
    if (str && str.length > cap) str = str.slice(0, cap) + ` …(+${str.length - cap})`;
    console.log(`  ${label}:`, str);
  };
  console.log('  ── deep keys (F0.5) ──');
  dump('operational.categories', data.operational?.categories);
  dump('data.user', data.user);
  dump('data.profile', data.profile);
  dump('formData.user_info', fd.user_info);
  dump('data.restaurant', data.restaurant);
  dump('formData.identity', fd.identity);
  dump('insumo[0] FULL', insumos[0]);
  const prep = insumos.find((i) => Array.isArray(i.subIngredients) && i.subIngredients.length);
  if (prep) { dump('insumo PREPARADO FULL', prep, 1500); dump('  subIngredient[0]', prep.subIngredients[0]); }
  if (fSimple) dump('ficha simples[0] FULL', fSimple, 1400);
  if (fsItems[0]) dump('ficha item[0] FULL', fsItems[0]);
  dump('employees[0]', fd.employees?.[0]);
  dump('partners[0]', fd.partners?.[0]);
  dump('equipment[0]', fd.equipment?.[0]);
  dump('vehicles[0]', fd.vehicles?.[0]);
  dump('fees_cards[0]', fd.fees_cards?.[0]);
  dump('fees_marketplaces[0]', fd.fees_marketplaces?.[0]);
  dump('metric_snapshots (1 entry)', Object.entries(fd.metric_snapshots || {})[0]);
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

  // 0) Categorias → Category (catalogo por cliente). operational.categories é um
  //    OBJETO { insumos:[], fichas:[] } (NÃO lista). Coletamos da lista custom +
  //    dos valores realmente usados (insumos/fichas/menu). 'menu' não tem fonte
  //    em operational.categories: vem só dos distinct de menuEngineering.
  const catByScope = { ingredient: new Set(), sheet: new Set(), menu: new Set() };
  const addCat = (scope, v) => { const x = (v == null ? '' : String(v)).trim(); if (x) catByScope[scope].add(x); };
  for (const c of (op.categories?.insumos || [])) addCat('ingredient', c);
  for (const c of (op.categories?.fichas || [])) addCat('sheet', c);
  for (const it of (op.insumos || [])) addCat('ingredient', first(it.categoria, it.category));
  for (const f of (op.fichas || [])) addCat('sheet', first(f.categoria, f.category, f.type));
  for (const m of (data.menuEngineering || [])) addCat('menu', first(m.categoria, m.category, m.type));
  const catMap = { ingredient: {}, sheet: {}, menu: {} };
  const catRows = [];
  for (const scope of ['ingredient', 'sheet', 'menu']) {
    for (const name of catByScope[scope]) {
      const id = uuid();
      catMap[scope][name] = id;
      catRows.push({ id, clientId: cid, name, scope, isSystem: false, modifiedBy: MODIFIED_BY });
    }
  }
  counts.category = await insertMany(s.category, catRows);
  const catId = (scope, v) => { const x = (v == null ? '' : String(v)).trim(); return x ? (catMap[scope][x] || null) : null; };

  // 1) Insumos → Ingredient (mapa legacyId → id)
  const ingMap = {};
  const ingRows = (op.insumos || []).map((it) => {
    const id = uuid();
    if (it.id != null) ingMap[String(it.id)] = id;
    const cat = first(it.categoria, it.category);
    const ry = parseYield(it.rendimento);
    return {
      id, clientId: cid, legacyId: it.id != null ? String(it.id) : null,
      categoryId: catId('ingredient', cat),
      name: first(it.nome, it.name) || 'Insumo',
      category: cat || null,
      unit: first(it.unidade, it.unidadeMedida, it.unit) || null,
      packUnit: first(it.purchaseUnit, it.unidadeCompra) || null,
      packPrice: money(first(it.purchaseTotal, it.precoEmbalagem, it.packPrice)),
      packQty: money(first(it.purchaseQty, it.qtdEmbalagem, it.packQty)),
      unitCost: money(first(it.custo, it.custoUnitario, it.precoUnitario, it.unitCost)),
      price: money(it.price),
      refQty: money(it.qty),
      defaultQty: money(it.defaultQty),
      grossQty: money(it.grossQty),
      yield: ry.value,
      yieldUnit: ry.unit,
      isPrepared: boolish(it.isPrepared),
      preparedYield: money(it.rendimentoPreparado),
      preparedYieldUnit: it.rendimentoUnit || null,
      preparedTotalCost: money(it.totalCost),
      sourceUpdatedAt: epochToDate(it.lastUpdated),
      modifiedBy: MODIFIED_BY,
    };
  });
  counts.ingredient = await insertMany(s.ingredient, ingRows);

  // 1b) Sub-receita do insumo preparado → IngredientComponent (árvore recursiva)
  const compRows = [];
  for (const it of (op.insumos || [])) {
    if (Array.isArray(it.subIngredients) && it.subIngredients.length) {
      const rootId = it.id != null ? ingMap[String(it.id)] : null;
      if (rootId) emitComponents(it.subIngredients, rootId, null, ingMap, compRows);
    }
  }
  counts.ingredientComponent = await insertMany(s.ingredientComponent, compRows);

  // 2) Fichas pass 1 → TechnicalSheet (mapa fichaLegacyId → sheetId)
  const sheetMap = {};
  const sheetRows = (op.fichas || []).map((f) => {
    const id = uuid();
    if (f.id != null) sheetMap[String(f.id)] = id;
    const fcat = first(f.categoria, f.category, f.type);
    return {
      id, clientId: cid, legacyId: f.id != null ? String(f.id) : null,
      categoryId: catId('sheet', fcat),
      name: first(f.nome, f.name) || 'Ficha',
      category: fcat || null,
      isModular: !!f.isModular,
      yield: money(first(f.rendimento, f.yield)),
      sellingPrice: money(first(f.precoVenda, f.sellingPrice)),
      totalCost: money(first(f.custoTotal, f.totalCost)),
      costIngredients: money(f.custoInsumos),
      costPackaging: money(f.custoEmbalagem),
      costMin: money(f.custoMin), costMax: money(f.custoMax),
      salesEstimateMonthly: money(f.vendasMes),
      prepTimeMinutes: intOrNull(f.tempoPreparo),
      utensils: (f.utensilios && String(f.utensilios).trim()) || null,
      finishing: (f.finalizacao && String(f.finalizacao).trim()) || null,
      dishPhoto: urlOnly(f.fotoPrato),
      isImported: boolish(f.isImported),
      progress: intOrNull(f.progress),
      sourceCreatedAt: epochToDate(f.createdAt),
      sourceUpdatedAt: epochToDate(f.lastUpdated),
      modifiedBy: MODIFIED_BY,
    };
  });
  counts.technicalSheet = await insertMany(s.technicalSheet, sheetRows);

  // 3) Fichas pass 2 → itens (simples) ou módulos+opções (modular) + passos do preparo
  const itemRows = []; const moduleRows = []; const optionRows = []; const stepRows = [];
  for (const f of (op.fichas || [])) {
    const sheetId = sheetMap[String(f.id)];
    if (!sheetId) continue;
    // modo de preparo → TechnicalSheetStep (passos ordenados; array de string ou objeto)
    let pos = 0;
    for (const step of (Array.isArray(f.modoPreparo) ? f.modoPreparo : [])) {
      const txt = typeof step === 'object' && step ? first(step.text, step.texto, step.descricao, step.passo) : step;
      const t = (txt == null ? '' : String(txt)).trim();
      if (!t) continue;
      stepRows.push({ id: uuid(), sheetId, position: ++pos, text: t, modifiedBy: MODIFIED_BY });
    }
    if (f.isModular) {
      for (const m of (f.modules || [])) {
        const moduleId = uuid();
        moduleRows.push({ id: moduleId, sheetId, legacyId: m.id != null ? String(m.id) : null, name: first(m.nome, m.name) || 'Módulo', required: m.required !== false, modifiedBy: MODIFIED_BY });
        for (const o of (m.options || [])) {
          optionRows.push({
            id: uuid(), moduleId, legacyId: o.id != null ? String(o.id) : null,
            name: first(o.nome, o.name) || 'Opção',
            cost: money(first(o.custo, o.cost)),
            isDefault: !!(o.default || o.isDefault),
            linkedSheetId: o.linkedFichaId != null ? (sheetMap[String(o.linkedFichaId)] || null) : null,
            modifiedBy: MODIFIED_BY,
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
          // metadados de conversão (reconstroem o custo sem reprocessar)
          defaultQty: money(it.defaultQty), grossQty: money(it.grossQty), netQty: money(it.netQty),
          correctionFactor: money(it.fc),
          usageUnit: it.usageUnit || null, purchaseUnit: it.purchaseUnit || null, originalUnit: it.originalUnit || null,
          modifiedBy: MODIFIED_BY,
        });
      }
    }
  }
  counts.sheetItem = await insertMany(s.technicalSheetItem, itemRows);
  counts.sheetModule = await insertMany(s.sheetModule, moduleRows);
  counts.sheetOption = await insertMany(s.sheetModuleOption, optionRows);
  counts.sheetStep = await insertMany(s.technicalSheetStep, stepRows);

  // 4) Menu engineering → MenuItem
  const menuRows = (data.menuEngineering || []).map((m) => {
    const mcat = first(m.categoria, m.category, m.type);
    return {
      id: uuid(), clientId: cid, legacyId: m.id != null ? String(m.id) : null,
      sheetId: m.fichaId != null ? (sheetMap[String(m.fichaId)] || null) : null,
      categoryId: catId('menu', mcat),
      name: first(m.nome, m.name) || 'Item',
      category: mcat || null,
      salesEstimate: money(first(m.sales, m.vendas)),
      price: money(m.price ?? m.preco), cost: money(m.cost ?? m.custo),
      modifiedBy: MODIFIED_BY,
    };
  });
  counts.menuItem = await insertMany(s.menuItem, menuRows);

  // 5) Faturamento mensal (revenue_history "MM/AAAA")
  const revRows = [];
  for (const e of (fd.revenue_history || [])) {
    if (!e?.month) continue;
    const [mm, yyyy] = String(e.month).split('/');
    const month = intOrNull(mm); const year = intOrNull(yyyy);
    const amount = money(e.amount);
    if (month && year && amount !== null) revRows.push({ id: uuid(), clientId: cid, year, month, amount, source: 'onboarding', modifiedBy: MODIFIED_BY });
  }
  counts.revenue = await insertMany(s.revenueEntry, revRows);

  // 6) Faturamento diário (daily_revenue { "YYYY-MM-DD": valor })
  const dailyRows = Object.entries(fd.daily_revenue || {}).map(([date, v]) => ({
    id: uuid(), clientId: cid, date, amount: money(v), source: 'manual', modifiedBy: MODIFIED_BY,
  })).filter((r) => r.amount !== null);
  counts.daily = await insertMany(s.dailyRevenue, dailyRows);

  // 7) Company profile (1:1) — inclui identidade do restaurante e perfil do dono.
  //    Imagens (logo/foto) são base64 gigantes no blob → só migramos se forem URL
  //    (urlOnly); o base64 permanece no blob até uma migração p/ object storage.
  const prof = data.profile || {};
  const usr = data.user || {};
  const uinfo = fd.user_info || {};
  const profileRows = [{
    id: uuid(), clientId: cid,
    restaurantName: first(data.restaurant?.name, fd.identity?.restaurant_name, fd.identity?.company_name),
    restaurantCategory: first(data.restaurant?.category, fd.identity?.category),
    cuisineType: fd.identity?.cuisine_type || null,
    businessLogo: urlOnly(first(fd.identity?.business_logo, data.restaurant?.logo)),
    taxRegime: fd.identity?.tax_regime || null,
    isMei: boolish(fd.identity?.is_mei),
    simplesRate: money(fd.admin_systems?.simples_rate),
    rentMonthly: money(fd.location_costs?.rent),
    iptuAnnual: money(fd.location_costs?.iptu_annual),
    ownerName: first(usr.name, prof.name, uinfo.user_name) || null,
    ownerRole: first(usr.role, prof.role) || null,
    ownerIsOwner: typeof usr.isOwner === 'boolean' ? usr.isOwner : null,
    ownerEmail: first(prof.email, uinfo.user_email) || null,
    ownerPhone: first(prof.phone, uinfo.user_phone) || null,
    ownerCpf: prof.cpf || null,                 // PII
    ownerBirthday: prof.birthday || null,
    ownerPhoto: urlOnly(first(usr.photo, prof.photo, uinfo.user_photo)),
    modifiedBy: MODIFIED_BY,
  }];
  counts.profile = await insertMany(s.companyProfile, profileRows);

  // 8) Custos fixos genéricos → FixedCostItem
  const costRows = [];
  const pushCost = (group, key, val, label) => { const a = money(val); if (a !== null && parseFloat(a) !== 0) costRows.push({ id: uuid(), clientId: cid, costGroup: group, costKey: key, label: label || key, amount: a, modifiedBy: MODIFIED_BY }); };
  if (fd.location_costs) pushCost('location', 'rent', fd.location_costs.rent, 'Aluguel');
  for (const k of ['energy', 'water', 'internet', 'telefone', 'security', 'security_guard']) pushCost('utilities', k, fd.utilities?.[k]);
  for (const k of ['pest_control', 'waste_removal', 'cleaning_supplies']) pushCost('recurring', k, fd.recurring_services?.[k]);
  for (const k of ['kitchen_gas', 'kitchen_oil', 'disposables']) pushCost('operational', k, fd.operational_fixed?.[k]);
  for (const k of ['software_pdv', 'accountant', 'card_machine_rent', 'taxes_das']) pushCost('admin', k, fd.admin_systems?.[k]);
  for (const k of ['agency', 'ads_budget']) pushCost('marketing', k, fd.marketing_structure?.[k]);
  for (const it of (fd.monthly_services || [])) pushCost('monthly_service', null, it.value, first(it.name, it.label));
  for (const it of (fd.other_fixed_costs || [])) pushCost('other', null, it.value, first(it.name, it.label));
  counts.fixedCost = await insertMany(s.fixedCostItem, costRows);

  // 9) Employees / Partners / Equipment / Vehicles / Cards / Marketplaces / Snapshots
  // Vínculo best-effort Employee→BpoEmployee e Partner→BpoPartner: cpf-first (igual
  // onboardingSync), senão nome normalizado SÓ se houver candidato ÚNICO (evita
  // ligar no "João" errado). paymentMethodId dos cartões/marketplaces fica NULL no
  // backfill — o link definitivo acontece no dual-write (F2) via onboardingSync,
  // que é dono da derivação do nome do PaymentMethod (débito+crédito).
  const makeMatcher = (rows, nameKey) => {
    const byCpf = new Map(rows.filter((r) => r.cpf).map((r) => [r.cpf, r.id]));
    const byName = new Map();
    for (const r of rows) { const k = norm(r[nameKey]); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(r.id); }
    return (cpf, name) => {
      if (cpf && byCpf.has(cpf)) return byCpf.get(cpf);
      const arr = byName.get(norm(name));
      return arr && arr.length === 1 ? arr[0] : null;
    };
  };
  const matchEmp = makeMatcher(await prisma.bpoEmployee.findMany({ where: { clientId: cid }, select: { id: true, cpf: true, name: true } }), 'name');
  const matchPartner = makeMatcher(await prisma.bpoPartner.findMany({ where: { clientId: cid }, select: { id: true, cpf: true, name: true } }), 'name');

  counts.employee = await insertMany(s.employee, (fd.employees || []).map((e) => ({
    id: uuid(), clientId: cid, legacyId: e.id != null ? String(e.id) : null,
    bpoEmployeeId: matchEmp(e.cpf || null, e.name),
    name: e.name || null, cpf: e.cpf || null, role: e.role || null, regime: e.regime || null,
    baseSalary: money(e.base_salary), bonus: money(e.premio),
    transportValue: money(e.transport_value), transportQty: intOrNull(e.transport_qty),
    workDays: intOrNull(e.work_days), foodCost: money(e.food_cost),
    modifiedBy: MODIFIED_BY,
  })));
  counts.partner = await insertMany(s.partner, (fd.partners || []).map((p) => ({
    id: uuid(), clientId: cid, legacyId: p.id != null ? String(p.id) : null,
    bpoPartnerId: matchPartner(p.cpf || null, p.name),
    name: p.name || null, cpf: p.cpf || null, role: p.role || null, proLabore: money(p.pro_labore),
    personalAccountBank: p.personal_bank || null, personalAccountAgency: p.personal_agency || null, personalAccountNumber: p.personal_account || null,
    modifiedBy: MODIFIED_BY,
  })));
  counts.equipment = await insertMany(s.equipment, (fd.equipment || []).map((e) => ({
    id: uuid(), clientId: cid, legacyId: e.id != null ? String(e.id) : null,
    name: first(e.name, e.description) || null, value: money(e.value), lifespanYears: money(e.lifespan) || '5',
    modifiedBy: MODIFIED_BY,
  })));
  counts.vehicle = await insertMany(s.vehicle, (fd.vehicles || []).map((v) => ({
    id: uuid(), clientId: cid, legacyId: v.id != null ? String(v.id) : null,
    description: first(v.name, v.description) || null,
    installment: money(v.installment), maintenanceMonthly: money(v.maintenance_monthly),
    insuranceAnnual: money(v.insurance_annual), ipvaAnnual: money(v.ipva_annual),
    modifiedBy: MODIFIED_BY,
  })));
  counts.cardMachine = await insertMany(s.cardMachine, (fd.fees_cards || []).map((c) => ({
    id: uuid(), clientId: cid, legacyId: c.id != null ? String(c.id) : null,
    provider: first(c.provider, c.name) || null,
    customProvider: c.custom_provider || null,
    debitRate: money(String(c.debit_rate || '').replace('%', '')), creditRate: money(String(c.credit_rate || '').replace('%', '')),
    modifiedBy: MODIFIED_BY,
  })));
  counts.marketplace = await insertMany(s.marketplace, (fd.fees_marketplaces || []).map((m) => ({
    id: uuid(), clientId: cid, legacyId: m.id != null ? String(m.id) : null,
    provider: m.provider || null, customProvider: m.custom_provider || null,
    commission: money(String(m.commission || '').replace('%', '')), salesPercentage: money(String(m.sales_percentage || '').replace('%', '')),
    monthlyFee: money(m.monthly_fee),
    modifiedBy: MODIFIED_BY,
  })));
  counts.metricSnapshot = await insertMany(s.metricSnapshot, Object.entries(fd.metric_snapshots || {}).map(([periodKey, d]) => ({
    id: uuid(), clientId: cid, periodKey,
    cmv: money(d?.cmv), marketplaceFee: money(d?.marketplace), fixedCosts: money(d?.fixedCosts),
    cardFee: money(d?.cardFee), advances: money(d?.advances), loans: money(d?.loans),
    drivers: d, modifiedBy: MODIFIED_BY,
  })));

  // ── Validação (somas batem com o blob?) ──
  const blobRevTotal = (fd.revenue_history || []).reduce((a, e) => a + (parseFloat(money(e.amount)) || 0), 0)
    + Object.values(fd.daily_revenue || {}).reduce((a, v) => a + (parseFloat(money(v)) || 0), 0);
  const tabRevTotal = revRows.reduce((a, r) => a + parseFloat(r.amount), 0) + dailyRows.reduce((a, r) => a + parseFloat(r.amount), 0);
  const revOk = Math.abs(blobRevTotal - tabRevTotal) < 0.01;

  const blob = {
    ingredient: (op.insumos || []).length,
    technicalSheet: (op.fichas || []).length,
    sheetItem: (op.fichas || []).reduce((a, f) => a + (f.isModular ? 0 : ([f.ingredients, f.insumos, f.itens, f.items].find(Array.isArray) || []).length), 0),
    sheetModule: (op.fichas || []).reduce((a, f) => a + (f.isModular ? (f.modules || []).length : 0), 0),
    sheetOption: (op.fichas || []).reduce((a, f) => a + (f.isModular ? (f.modules || []).reduce((b, m) => b + (m.options || []).length, 0) : 0), 0),
    menuItem: (data.menuEngineering || []).length,
    employee: (fd.employees || []).length,
    partner: (fd.partners || []).length,
    equipment: (fd.equipment || []).length,
    vehicle: (fd.vehicles || []).length,
    cardMachine: (fd.fees_cards || []).length,
    marketplace: (fd.fees_marketplaces || []).length,
  };

  // Cobertura F0.5: quantos registros pegaram os campos NOVOS (valida o mapeamento)
  const coverage = {
    categories: catRows.length,
    ingWithCat: ingRows.filter((r) => r.categoryId).length,
    sheetWithCat: sheetRows.filter((r) => r.categoryId).length,
    menuWithCat: menuRows.filter((r) => r.categoryId).length,
    ingPackUnit: ingRows.filter((r) => r.packUnit).length,
    ingPrepared: ingRows.filter((r) => r.isPrepared).length,
    ingComponents: compRows.length,
    sheetSrcUpdated: sheetRows.filter((r) => r.sourceUpdatedAt).length,
    sheetFinishing: sheetRows.filter((r) => r.finishing).length,
    steps: stepRows.length,
    ownerName: profileRows.filter((r) => r.ownerName).length,
    empBpoLinked: (fd.employees || []).filter((e) => matchEmp(e.cpf || null, e.name)).length,
    partnerBpoLinked: (fd.partners || []).filter((p) => matchPartner(p.cpf || null, p.name)).length,
  };

  return {
    client: client.hash,
    counts,
    blob,
    coverage,
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
    // ── Reconciliação por domínio: blob × tabelas (somado nos N clientes) ──
    const DOMAINS = ['ingredient', 'technicalSheet', 'sheetItem', 'sheetModule', 'sheetOption', 'menuItem', 'employee', 'partner', 'equipment', 'vehicle', 'cardMachine', 'marketplace'];
    const LABEL = { ingredient: 'Insumos', technicalSheet: 'Fichas', sheetItem: 'Itens de ficha', sheetModule: 'Modulos', sheetOption: 'Opcoes', menuItem: 'Menu', employee: 'Funcionarios', partner: 'Socios', equipment: 'Equipamentos', vehicle: 'Veiculos', cardMachine: 'Maq. cartao', marketplace: 'Marketplaces' };
    console.log('\n=== Reconciliacao: JSON (blob) X tabelas Drizzle — total nos ' + reports.length + ' clientes ===');
    console.log('Dominio'.padEnd(16) + 'blob'.padStart(9) + 'tabelas'.padStart(10) + '   status');
    console.log('-'.repeat(45));
    let allOk = true;
    for (const d of DOMAINS) {
      const b = reports.reduce((a, r) => a + (r.blob[d] || 0), 0);
      const t = reports.reduce((a, r) => a + (r.counts[d] || 0), 0);
      const ok = b === t; if (!ok) allOk = false;
      console.log(LABEL[d].padEnd(16) + String(b).padStart(9) + String(t).padStart(10) + '   ' + (ok ? 'OK' : 'DIVERGE !'));
    }
    console.log('-'.repeat(45));
    console.log(allOk
      ? 'TUDO BATE: todo o conteudo do blob esta nas tabelas (sem ser JSON).'
      : 'HA DIVERGENCIA — investigar os dominios marcados acima.');

    // ── Cobertura F0.5: campos NOVOS populados (soma nos N clientes) ──
    const cov = (k) => reports.reduce((a, r) => a + ((r.coverage && r.coverage[k]) || 0), 0);
    console.log('\n=== Cobertura F0.5 (campos novos populados, total) ===');
    console.log(`  Categorias criadas .............. ${cov('categories')}`);
    console.log(`  Insumos c/ categoryId .......... ${cov('ingWithCat')}   c/ packUnit: ${cov('ingPackUnit')}   isPrepared: ${cov('ingPrepared')}`);
    console.log(`  Componentes de preparado ....... ${cov('ingComponents')}`);
    console.log(`  Fichas c/ categoryId ........... ${cov('sheetWithCat')}   c/ sourceUpdatedAt: ${cov('sheetSrcUpdated')}   c/ finalizacao: ${cov('sheetFinishing')}`);
    console.log(`  Menu c/ categoryId ............. ${cov('menuWithCat')}`);
    console.log(`  Passos de preparo (steps) ...... ${cov('steps')}`);
    console.log(`  Perfis c/ nome do dono ......... ${cov('ownerName')}`);
    console.log(`  Vínculos Employee→BpoEmployee .. ${cov('empBpoLinked')}   Partner→BpoPartner: ${cov('partnerBpoLinked')}`);

    console.log(`\n${DRY ? '[DRY] ' : ''}Concluído. ${reports.length} clientes, ${problems} com divergência (contagem+receita por cliente).`);
    if (DRY) console.log('Nada gravado (dry-run / leitura). Banco local intacto.');
  }
}

main()
  .catch((e) => { console.error('Falha:', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
