'use strict';
/**
 * f3-roundtrip-menu.js — PORTÃO da F3 (menu). Reconstrói menuEngineering das
 * tabelas e compara com o blob. Só leitura. Uso: node scripts/f3-roundtrip-menu.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { db, pool } = require('../src/db/client');
const s = require('../src/db/schema');
const { reconstructMenu } = require('../src/services/coreRead');

const prisma = new PrismaClient();
function parseNum(v) { if (v == null || v === '') return null; if (typeof v === 'number') return v; let x = String(v).replace(/R\$/g, '').trim(); if (x.includes(',') && x.includes('.')) x = x.replace(/\./g, '').replace(',', '.'); else if (x.includes(',')) x = x.replace(',', '.'); x = x.replace(/[^0-9.\-]/g, ''); const n = parseFloat(x); return isFinite(n) ? n : null; }
const numEq = (a, b) => Math.abs((parseNum(a) || 0) - (parseNum(b) || 0)) < 0.005;
const strEq = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();
const NUM = ['sales', 'price', 'cost'];
const STR = ['name', 'category'];

async function main() {
  const list = await prisma.client.findMany({ select: { id: true, data: true } });
  const miss = {}, lossy = new Set();
  let total = 0, unmatched = 0;
  for (const c of list) {
    let d; try { d = JSON.parse(c.data || '{}'); } catch { continue; }
    const bm = d.menuEngineering || []; if (!bm.length) continue;
    const rb = await reconstructMenu(db, s, c.id);
    const rById = new Map(rb.map((r) => [String(r.id), r]));
    const rByName = new Map(rb.map((r) => [String(r.name).trim(), r]));
    for (const b of bm) {
      total++;
      // itens sem id (seed) casam por nome — a reconstrução ADICIONA um id (não perde dado)
      const r = (b.id != null && rById.get(String(b.id))) || rByName.get(String(b.name).trim());
      if (!r) { unmatched++; continue; }
      for (const k of Object.keys(b)) { if (b[k] !== '' && b[k] != null && !(k in r)) lossy.add(k); }
      for (const f of NUM) { if (b[f] !== undefined && !numEq(b[f], r[f])) miss[f] = (miss[f] || 0) + 1; }
      for (const f of STR) { if (b[f] !== undefined && b[f] !== '' && !strEq(b[f], r[f])) miss[f] = (miss[f] || 0) + 1; }
    }
  }
  console.log(`=== F3 round-trip (menu) — ${list.length} clientes ===`);
  console.log(`menu items: ${total} · sem match por id: ${unmatched}`);
  console.log('Campos divergentes:');
  const k = Object.keys(miss).sort((a, b) => miss[b] - miss[a]);
  if (!k.length) console.log('  (nenhum) ✅'); else for (const f of k) console.log(`  ✗ ${f.padEnd(12)} ${miss[f]}`);
  console.log('Chaves do blob NÃO reconstruídas (lossy):', lossy.size ? [...lossy].join(', ') : '(nenhuma) ✅');
  console.log(`\n>>> MENU fiel? ${(!k.length && !unmatched && !lossy.size) ? 'SIM ✅' : 'NÃO ⚠️'}`);
}
main().catch((e) => { console.error('Falha:', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
