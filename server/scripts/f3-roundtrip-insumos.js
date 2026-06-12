'use strict';
/**
 * f3-roundtrip-insumos.js — PORTÃO da F3 (insumos).
 *
 * Para cada cliente: reconstrói operational.insumos a partir das tabelas
 * (coreRead.reconstructInsumos) e compara campo-a-campo com o blob real.
 * Revela exatamente quais campos são fiéis e quais são lossy — ANTES de ligar
 * a flag de leitura por tabela. Só leitura; não grava nada.
 *
 * Uso: node scripts/f3-roundtrip-insumos.js [--client=<hash>] [--show=<n>]
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { db, pool } = require('../src/db/client');
const s = require('../src/db/schema');
const { reconstructInsumos } = require('../src/services/coreRead');

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const opt = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const ONLY = opt('client');
const SHOW = parseInt(opt('show') || '0', 10);

function parseNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let str = String(v).replace(/R\$/g, '').trim();
  if (str.includes(',') && str.includes('.')) str = str.replace(/\./g, '').replace(',', '.');
  else if (str.includes(',')) str = str.replace(',', '.');
  str = str.replace(/[^0-9.\-]/g, '');
  const n = parseFloat(str);
  return isFinite(n) ? n : null;
}
const numEq = (a, b) => { const x = parseNum(a), y = parseNum(b); return Math.abs((x || 0) - (y || 0)) < 0.005; };
const strEq = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();
// rendimento "01kg" / "1kg" / "kg" → compara número + unidade (ignora zero à esquerda sujo)
function yieldParts(v) { const s = String(v ?? '').trim(); const m = s.match(/^\s*(-?[\d.,]+)?\s*([^\d.,\s]*)/); return { n: parseNum(m && m[1]), u: (m && m[2] || '').trim() }; }
const yieldEq = (a, b) => { const x = yieldParts(a), y = yieldParts(b); return Math.abs((x.n || 0) - (y.n || 0)) < 0.005 && x.u === y.u; };

const NUM_FIELDS = ['custo', 'price', 'purchaseTotal', 'purchaseQty', 'qty', 'defaultQty', 'grossQty', 'rendimentoPreparado', 'totalCost'];
const STR_FIELDS = ['name', 'category', 'unit', 'purchaseUnit'];
const SUB_NUM = ['qty', 'price', 'custo', 'purchaseTotal', 'purchaseQty', 'defaultQty', 'grossQty', 'netQty', 'fc', 'rendimentoPreparado', 'totalCost'];
const SUB_STR = ['name', 'unit', 'purchaseUnit', 'usageUnit', 'originalUnit', 'rendimentoUnit'];

async function main() {
  const where = ONLY ? { OR: [{ hash: ONLY }, { id: ONLY }] } : {};
  const list = await prisma.client.findMany({ where, select: { id: true, hash: true, name: true } });
  console.log(`=== F3 round-trip (insumos) — ${list.length} clientes ===\n`);

  const fieldMiss = {};       // campo top-level → nº de insumos divergentes
  const subFieldMiss = {};    // campo de subIngredient → nº divergente
  const subLossy = new Set(); // chaves do blob sub que a reconstrução NÃO produz
  let totalInsumos = 0, unmatched = 0, isPreparedMiss = 0;
  let totalSubs = 0, subCountMiss = 0, shown = 0;

  for (const meta of list) {
    const c = await prisma.client.findUnique({ where: { id: meta.id }, select: { id: true, hash: true, data: true } });
    let data; try { data = JSON.parse(c.data || '{}'); } catch { continue; }
    const blobIns = (data.operational?.insumos || []);
    if (!blobIns.length) continue;
    const rebuilt = await reconstructInsumos(db, s, c.id);
    const byId = new Map(rebuilt.map((r) => [String(r.id), r]));

    for (const b of blobIns) {
      totalInsumos++;
      const r = byId.get(String(b.id));
      if (!r) { unmatched++; continue; }
      if (!!b.isPrepared !== !!r.isPrepared) isPreparedMiss++;
      for (const f of NUM_FIELDS) {
        if (b[f] === undefined && r[f] === undefined) continue;
        if (!numEq(b[f], r[f])) fieldMiss[f] = (fieldMiss[f] || 0) + 1;
      }
      for (const f of STR_FIELDS) {
        if (b[f] === undefined && (r[f] === undefined || r[f] === '')) continue;
        if (!strEq(b[f], r[f])) fieldMiss[f] = (fieldMiss[f] || 0) + 1;
      }
      if (!(b.rendimento === undefined && !r.rendimento) && !yieldEq(b.rendimento, r.rendimento)) fieldMiss.rendimento = (fieldMiss.rendimento || 0) + 1;
      // subIngredients
      const bs = Array.isArray(b.subIngredients) ? b.subIngredients : [];
      const rs = Array.isArray(r.subIngredients) ? r.subIngredients : [];
      if (bs.length) {
        totalSubs += bs.length;
        if (bs.length !== rs.length) subCountMiss++;
        const rsById = new Map(rs.map((x) => [String(x.id), x]));
        for (const sb of bs) {
          const sr = rsById.get(String(sb.id)) || {};
          // lossy = chave do blob com VALOR REAL (não-vazio) ausente na reconstrução
          for (const k of Object.keys(sb)) { if (k !== 'subIngredients' && sb[k] !== '' && sb[k] != null && !(k in sr)) subLossy.add(k); }
          if (!rsById.has(String(sb.id))) continue;
          for (const f of SUB_NUM) { if (sb[f] !== undefined && sb[f] !== '' && !numEq(sb[f], sr[f])) subFieldMiss[f] = (subFieldMiss[f] || 0) + 1; }
          for (const f of SUB_STR) { if (sb[f] !== undefined && sb[f] !== '' && !strEq(sb[f], sr[f])) subFieldMiss[f] = (subFieldMiss[f] || 0) + 1; }
          if (sb.rendimento !== undefined && sb.rendimento !== '' && !yieldEq(sb.rendimento, sr.rendimento)) subFieldMiss.rendimento = (subFieldMiss.rendimento || 0) + 1;
        }
      }
      if (SHOW && shown < SHOW && b.isPrepared) {
        console.log(`--- amostra prep (${meta.hash}) id=${b.id} ---`);
        console.log('  blob   :', JSON.stringify(b).slice(0, 400));
        console.log('  rebuild:', JSON.stringify(r).slice(0, 400));
        shown++;
      }
    }
  }

  const pct = (n) => totalInsumos ? ((n / totalInsumos) * 100).toFixed(1) : '0';
  console.log(`Insumos comparados: ${totalInsumos}  ·  sem match por id: ${unmatched}  ·  isPrepared divergente: ${isPreparedMiss}`);
  console.log(`Subingredientes: ${totalSubs}  ·  insumos c/ contagem de sub divergente: ${subCountMiss}\n`);

  console.log('Campos TOP-LEVEL divergentes (insumo):');
  const fkeys = Object.keys(fieldMiss).sort((a, b) => fieldMiss[b] - fieldMiss[a]);
  if (!fkeys.length) console.log('  (nenhum) ✅');
  for (const f of fkeys) console.log(`  ✗ ${f.padEnd(20)} ${fieldMiss[f]} insumos (${pct(fieldMiss[f])}%)`);

  console.log('\nCampos de SUBINGREDIENT divergentes (valor):');
  const skeys = Object.keys(subFieldMiss).sort((a, b) => subFieldMiss[b] - subFieldMiss[a]);
  if (!skeys.length) console.log('  (nenhum) ✅');
  for (const f of skeys) console.log(`  ✗ ${f.padEnd(20)} ${subFieldMiss[f]} subs`);

  console.log('\nChaves de subIngredient no BLOB que a reconstrução NÃO devolve (lossy):');
  console.log('  ' + (subLossy.size ? [...subLossy].join(', ') : '(nenhuma) ✅'));

  const topOk = !fkeys.length && !unmatched && !isPreparedMiss;
  const subOk = !skeys.length && !subCountMiss && !subLossy.size;
  console.log(`\n>>> TOP-LEVEL fiel? ${topOk ? 'SIM ✅' : 'NÃO ⚠️'}   ·   SUBINGREDIENTS fiel? ${subOk ? 'SIM ✅' : 'NÃO ⚠️'}`);
}

main()
  .catch((e) => { console.error('Falha:', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
