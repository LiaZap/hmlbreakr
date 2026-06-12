'use strict';
/**
 * backfill-core.js — F1 do refactor JSON → tabelas (carga inicial / reprocesso).
 *
 * Lê o blob `Client.data` (via Prisma) e popula as 19 tabelas Drizzle do núcleo,
 * delegando TODO o mapeamento pro módulo compartilhado src/services/coreSync.js
 * (o mesmo usado pelo hook de save da F2 — uma única fonte da verdade do mapa).
 *
 * RODE SEMPRE NUMA CÓPIA LOCAL DE PRODUÇÃO (ver scripts/prod-to-local.mjs).
 * DATABASE_URL deve apontar pro banco LOCAL. Nunca rode contra produção direto.
 *
 * Modos:
 *   --inspect            mostra a FORMA real dos dados (chaves de ficha/insumo/formData)
 *   --dry-run            simula e valida somas, NÃO grava
 *   --wipe               limpa as tabelas novas do cliente antes de inserir
 *   --client=<hash|id>   processa só um cliente
 *   --allow-remote       (perigo) permite rodar contra DATABASE_URL não-local
 *
 * Ex.:  node scripts/backfill-core.js --inspect --client=<hash>
 *       node scripts/backfill-core.js --dry-run
 *       node scripts/backfill-core.js --wipe
 */
require('dotenv').config();
const { db, pool } = require('../src/db/client');
const s = require('../src/db/schema');
const bpo = require('../src/db/schema-bpo');
const { eq, or } = require('drizzle-orm');
const { syncCoreTables } = require('../src/services/coreSync');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const DRY = has('--dry-run');
const INSPECT = has('--inspect');
const WIPE = has('--wipe');
const ONLY = opt('client');

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

  // Dump dirigido (confirmar chaves reais do blob)
  const dump = (label, obj, cap = 700) => {
    if (obj === undefined) { console.log(`  ${label}: <ausente>`); return; }
    let str; try { str = JSON.stringify(obj); } catch { str = String(obj); }
    if (str && str.length > cap) str = str.slice(0, cap) + ` …(+${str.length - cap})`;
    console.log(`  ${label}:`, str);
  };
  console.log('  ── deep keys ──');
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
  // Mapeamento + persistência centralizados no coreSync (mesmo da F2).
  const report = await syncCoreTables(db, s, client.id, data, { wipe: WIPE, dry: DRY, modifiedBy: 'backfill:F1' });
  return { client: client.hash, ...report };
}

async function main() {
  console.log(`=== backfill-core ${DRY ? '[DRY-RUN]' : ''}${INSPECT ? '[INSPECT]' : ''}${WIPE ? '[WIPE]' : ''} ===`);

  // TRAVA DE SEGURANÇA: este script é LOCAL-ONLY. Nunca escreve em produção.
  const dbUrl = process.env.DATABASE_URL || '';
  const isLocal = /@(localhost|127\.0\.0\.1|host\.docker\.internal)\b/.test(dbUrl);
  if (!isLocal && !has('--allow-remote')) {
    console.error('\nABORTADO: DATABASE_URL não parece LOCAL. Este script só migra na CÓPIA LOCAL.');
    console.error(`  DATABASE_URL host = ${(dbUrl.match(/@([^/:]+)/) || [])[1] || '(?)'}`);
    console.error('  Use a cópia local (porta 5433). Para rodar contra remoto (NÃO recomendado): --allow-remote.');
    process.exit(1);
  }
  const where = ONLY ? or(eq(bpo.client.hash, ONLY), eq(bpo.client.id, ONLY)) : undefined;
  // Busca só os ids primeiro; carrega o blob UM por vez → memória constante.
  const list = await db
    .select({ id: bpo.client.id, hash: bpo.client.hash, name: bpo.client.name })
    .from(bpo.client)
    .where(where);
  console.log(`Clientes: ${list.length}`);

  const reports = [];
  for (const meta of list) {
    const [c] = await db
      .select({ id: bpo.client.id, hash: bpo.client.hash, name: bpo.client.name, data: bpo.client.data })
      .from(bpo.client)
      .where(eq(bpo.client.id, meta.id))
      .limit(1);
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

    // ── Cobertura: campos NOVOS populados (soma nos N clientes) ──
    const cov = (k) => reports.reduce((a, r) => a + ((r.coverage && r.coverage[k]) || 0), 0);
    console.log('\n=== Cobertura (campos novos populados, total) ===');
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
  .finally(async () => { await pool.end(); });
