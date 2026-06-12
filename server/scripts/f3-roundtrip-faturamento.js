'use strict';
/**
 * f3-roundtrip-faturamento.js — PORTÃO da F3 (faturamento). Reconstrói
 * revenue_history + daily_revenue das tabelas e compara com o blob. Só leitura.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { db, pool } = require('../src/db/client');
const s = require('../src/db/schema');
const { reconstructFaturamento } = require('../src/services/coreRead');

const prisma = new PrismaClient();
function parseNum(v) { if (v == null || v === '') return null; if (typeof v === 'number') return v; let x = String(v).replace(/R\$/g, '').trim(); if (x.includes(',') && x.includes('.')) x = x.replace(/\./g, '').replace(',', '.'); else if (x.includes(',')) x = x.replace(',', '.'); x = x.replace(/[^0-9.\-]/g, ''); const n = parseFloat(x); return isFinite(n) ? n : null; }
const numEq = (a, b) => Math.abs((parseNum(a) || 0) - (parseNum(b) || 0)) < 0.005;

async function main() {
  const list = await prisma.client.findMany({ select: { id: true, data: true } });
  let rhBlob = 0, rhMiss = 0, rhAmt = 0, drBlob = 0, drMiss = 0, drVal = 0;
  for (const c of list) {
    let d; try { d = JSON.parse(c.data || '{}'); } catch { continue; }
    const fd = d.formData || {};
    const bRh = fd.revenue_history || []; const bDr = fd.daily_revenue || {};
    if (!bRh.length && !Object.keys(bDr).length) continue;
    const { revenue_history: rRh, daily_revenue: rDr } = await reconstructFaturamento(db, s, c.id);
    const rhByMonth = new Map(rRh.map((x) => [String(x.month), x]));
    // entries sem amount são placeholders de mês (sem dado) — o backfill os pula
    for (const e of bRh) { if (e.amount == null || e.amount === '') continue; rhBlob++; const r = rhByMonth.get(String(e.month)); if (!r) { rhMiss++; continue; } if (!numEq(e.amount, r.amount)) rhAmt++; }
    for (const [date, val] of Object.entries(bDr)) { drBlob++; if (!(date in rDr)) { drMiss++; continue; } if (!numEq(val, rDr[date])) drVal++; }
  }
  console.log(`=== F3 round-trip (faturamento) — ${list.length} clientes ===`);
  console.log(`revenue_history: ${rhBlob} · sem match (mês): ${rhMiss} · amount divergente: ${rhAmt}`);
  console.log(`daily_revenue: ${drBlob} · sem match (data): ${drMiss} · valor divergente: ${drVal}`);
  const ok = !rhMiss && !rhAmt && !drMiss && !drVal;
  console.log(`\n>>> FATURAMENTO fiel? ${ok ? 'SIM ✅' : 'NÃO ⚠️'}`);
}
main().catch((e) => { console.error('Falha:', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
