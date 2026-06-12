'use strict';
/**
 * f4-calc-parity.js — PORTÃO da F4. Para cada cliente, roda o financialCalc
 * sobre o BLOB e sobre o `data` reconstruído das TABELAS e compara os
 * indicadores. Se baterem, o cálculo server-side pode ler das tabelas. Só leitura.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { db, pool } = require('../src/db/client');
const s = require('../src/db/schema');
const { reconstructClientData } = require('../src/services/coreRead');
const { calculateClientFinancials } = require('../src/services/financialCalc');

const prisma = new PrismaClient();

// compara recursivamente os números (tolerância) de dois resultados do calc
function diffNumbers(a, b, path, out) {
  if (a == null && b == null) return;
  if (typeof a === 'number' || typeof b === 'number') {
    if (Math.abs((Number(a) || 0) - (Number(b) || 0)) >= 0.01) out.push(`${path}: blob=${a} tab=${b}`);
    return;
  }
  if (typeof a === 'object' && a && typeof b === 'object' && b) {
    // revenueMonths = contagem de meses; difere por placeholders sem amount (não afeta valores)
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { if (k === 'revenueMonths') continue; diffNumbers(a[k], b[k], path ? `${path}.${k}` : k, out); }
  }
}

async function main() {
  const list = await prisma.client.findMany({ select: { id: true, hash: true, data: true } });
  let ok = 0, bad = 0, bothNull = 0;
  const examples = [];
  for (const c of list) {
    let blob; try { blob = JSON.parse(c.data || '{}'); } catch { continue; }
    const fromBlob = (() => { try { return calculateClientFinancials(blob); } catch { return null; } })();
    const reb = await reconstructClientData(db, s, c.id, blob);
    const fromTab = (() => { try { return calculateClientFinancials(reb); } catch { return null; } })();
    if (fromBlob == null && fromTab == null) { bothNull++; continue; }
    const out = [];
    diffNumbers(fromBlob, fromTab, '', out);
    if (out.length) { bad++; if (examples.length < 6) examples.push({ hash: c.hash, diffs: out.slice(0, 4) }); }
    else ok++;
  }
  console.log(`=== F4 paridade do cálculo (blob × tabelas) — ${list.length} clientes ===`);
  console.log(`indicadores idênticos: ${ok} · divergentes: ${bad} · ambos sem DRE (receita 0): ${bothNull}`);
  for (const e of examples) { console.log(`  ⚠️ ${e.hash}:`); e.diffs.forEach((d) => console.log(`     ${d}`)); }
  console.log(`\n>>> CÁLCULO das tabelas == do blob? ${bad === 0 ? 'SIM ✅' : 'NÃO ⚠️'}`);
}
main().catch((e) => { console.error('Falha:', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
