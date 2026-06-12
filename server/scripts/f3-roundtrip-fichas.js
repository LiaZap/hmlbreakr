'use strict';
/**
 * f3-roundtrip-fichas.js — PORTÃO da F3 (fichas).
 * Reconstrói operational.fichas das tabelas e compara campo-a-campo com o blob.
 * Só leitura. Uso: node scripts/f3-roundtrip-fichas.js [--client=<hash>] [--show=N]
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { db, pool } = require('../src/db/client');
const s = require('../src/db/schema');
const { reconstructFichas } = require('../src/services/coreRead');

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
const numEq = (a, b) => Math.abs((parseNum(a) || 0) - (parseNum(b) || 0)) < 0.005;
const strEq = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();
function yieldParts(v) { const s2 = String(v ?? '').trim(); const m = s2.match(/^\s*(-?[\d.,]+)?\s*([^\d.,\s]*)/); return { n: parseNum(m && m[1]), u: (m && m[2] || '').trim() }; }
const yieldEq = (a, b) => { const x = yieldParts(a), y = yieldParts(b); return Math.abs((x.n || 0) - (y.n || 0)) < 0.005 && x.u === y.u; };

// NB: `insumos` é contador DERIVADO (=ingredients.length); o blob às vezes guarda valor stale.
// A reconstrução emite o valor correto. Não entra no veredito de fidelidade.
const F_NUM = ['custoTotal', 'precoVenda', 'custoInsumos', 'custoEmbalagem', 'custoMin', 'custoMax', 'vendasMes', 'progress'];
const F_STR = ['name', 'type', 'category', 'tempoPreparo', 'utensilios', 'finalizacao', 'fotoPrato'];
const IT_NUM = ['qty', 'price', 'custo', 'defaultQty', 'grossQty', 'netQty', 'fc', 'purchaseQty', 'purchaseTotal', 'rendimentoPreparado', 'totalCost'];
const IT_STR = ['name', 'unit', 'category', 'usageUnit', 'purchaseUnit', 'originalUnit', 'rendimentoUnit'];

async function main() {
  const where = ONLY ? { OR: [{ hash: ONLY }, { id: ONLY }] } : {};
  const list = await prisma.client.findMany({ where, select: { id: true, hash: true } });
  console.log(`=== F3 round-trip (fichas) — ${list.length} clientes ===\n`);

  const fMiss = {}, itMiss = {}, itLossy = new Set();
  let totalF = 0, unmatched = 0, modoMiss = 0, itemCountMiss = 0, totalItems = 0, subMiss = 0, shown = 0, modMiss = 0;

  for (const meta of list) {
    const c = await prisma.client.findUnique({ where: { id: meta.id }, select: { id: true, data: true } });
    let data; try { data = JSON.parse(c.data || '{}'); } catch { continue; }
    const blobF = data.operational?.fichas || [];
    if (!blobF.length) continue;
    const blobById = {}; for (const f of blobF) blobById[String(f.id)] = f;
    const rebuilt = await reconstructFichas(db, s, c.id, blobById);
    const rById = new Map(rebuilt.map((r) => [String(r.id), r]));

    for (const b of blobF) {
      totalF++;
      const r = rById.get(String(b.id));
      if (!r) { unmatched++; continue; }
      for (const f of F_NUM) { if (b[f] === undefined && r[f] === undefined) continue; if (!numEq(b[f], r[f])) fMiss[f] = (fMiss[f] || 0) + 1; }
      for (const f of F_STR) { if ((b[f] == null || b[f] === '') && (r[f] == null || r[f] === '')) continue; if (!strEq(b[f], r[f])) fMiss[f] = (fMiss[f] || 0) + 1; }
      if (!yieldEq(b.rendimento, r.rendimento)) fMiss.rendimento = (fMiss.rendimento || 0) + 1;
      // modoPreparo (array de strings)
      const bm = Array.isArray(b.modoPreparo) ? b.modoPreparo.map((x) => typeof x === 'object' ? (x.text || x.texto || '') : String(x)).filter((x) => x.trim()) : [];
      const rm = Array.isArray(r.modoPreparo) ? r.modoPreparo : [];
      if (bm.length !== rm.length || bm.some((x, i) => !strEq(x, rm[i]))) modoMiss++;
      // modules (modular)
      if (b.isModular) { const bmo = (b.modules || []).length; const rmo = (r.modules || []).length; if (bmo !== rmo) modMiss++; }
      // ingredients (itens)
      const bi = Array.isArray(b.ingredients) ? b.ingredients : ([b.insumos, b.itens, b.items].find(Array.isArray) || []);
      const ri = Array.isArray(r.ingredients) ? r.ingredients : [];
      if (!b.isModular) {
        if (bi.length !== ri.length) itemCountMiss++;
        const riById = new Map(ri.map((x) => [String(x.id), x]));
        for (const bit of bi) {
          totalItems++;
          const rit = riById.get(String(bit.id)) || {};
          for (const k of Object.keys(bit)) { if (k !== 'subIngredients' && bit[k] !== '' && bit[k] != null && !(k in rit)) itLossy.add(k); }
          if (!riById.has(String(bit.id))) continue;
          for (const f of IT_NUM) { if (bit[f] !== undefined && bit[f] !== '' && !numEq(bit[f], rit[f])) itMiss[f] = (itMiss[f] || 0) + 1; }
          for (const f of IT_STR) { if (bit[f] !== undefined && bit[f] !== '' && !strEq(bit[f], rit[f])) itMiss[f] = (itMiss[f] || 0) + 1; }
          if (bit.rendimento !== undefined && bit.rendimento !== '' && !yieldEq(bit.rendimento, rit.rendimento)) itMiss.rendimento = (itMiss.rendimento || 0) + 1;
          const bs = Array.isArray(bit.subIngredients) ? bit.subIngredients : [];
          const rs = Array.isArray(rit.subIngredients) ? rit.subIngredients : [];
          if (bs.length !== rs.length) subMiss++;
        }
      }
      if (SHOW && shown < SHOW) { console.log(`--- ${meta.hash} ficha ${b.id} (${b.name}) ---`); console.log('  blob:', JSON.stringify(b).slice(0, 350)); console.log('  reb :', JSON.stringify(r).slice(0, 350)); shown++; }
    }
  }

  const line = (o) => { const k = Object.keys(o).sort((a, b) => o[b] - o[a]); if (!k.length) { console.log('  (nenhum) ✅'); return; } for (const f of k) console.log(`  ✗ ${f.padEnd(18)} ${o[f]}`); };
  console.log(`Fichas: ${totalF} · sem match: ${unmatched} · modoPreparo divergente: ${modoMiss} · modules divergente: ${modMiss}`);
  console.log(`Itens: ${totalItems} · fichas c/ contagem de itens divergente: ${itemCountMiss} · itens c/ sub count divergente: ${subMiss}\n`);
  console.log('Campos da FICHA divergentes:'); line(fMiss);
  console.log('\nCampos do ITEM divergentes:'); line(itMiss);
  console.log('\nChaves do ITEM no blob NÃO reconstruídas (lossy):'); console.log('  ' + (itLossy.size ? [...itLossy].join(', ') : '(nenhuma) ✅'));
  const fOk = !Object.keys(fMiss).length && !unmatched && !modoMiss && !modMiss;
  const itOk = !Object.keys(itMiss).length && !itLossy.size && !itemCountMiss && !subMiss;
  console.log(`\n>>> FICHA fiel? ${fOk ? 'SIM ✅' : 'NÃO ⚠️'}   ·   ITENS fiéis? ${itOk ? 'SIM ✅' : 'NÃO ⚠️'}`);
}

main().catch((e) => { console.error('Falha:', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
