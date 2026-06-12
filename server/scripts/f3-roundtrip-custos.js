'use strict';
/**
 * f3-roundtrip-custos.js — PORTÃO da F3 (custos: 6 listas). Reconstrói
 * employees/partners/equipment/vehicles/fees_cards/fees_marketplaces das tabelas
 * e compara com o blob (match por nome/provider; compara VALORES). Só leitura.
 * NÃO cobre objetos de custo / identity / onboarding (ficam no blob).
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { db, pool } = require('../src/db/client');
const s = require('../src/db/schema');
const { reconstructCustos } = require('../src/services/coreRead');

const prisma = new PrismaClient();
function parseNum(v) { if (v == null || v === '') return null; if (typeof v === 'number') return v; let x = String(v).replace(/R\$/g, '').replace(/%/g, '').trim(); if (x.includes(',') && x.includes('.')) x = x.replace(/\./g, '').replace(',', '.'); else if (x.includes(',')) x = x.replace(',', '.'); x = x.replace(/[^0-9.\-]/g, ''); const n = parseFloat(x); return isFinite(n) ? n : null; }
const numEq = (a, b) => Math.abs((parseNum(a) || 0) - (parseNum(b) || 0)) < 0.005;
const strEq = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();
const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const LISTS = {
  employees: { key: 'name', num: ['base_salary', 'premio', 'transport_value', 'food_cost', 'transport_qty', 'work_days'], str: ['name', 'role', 'regime', 'cpf'] },
  partners: { key: 'name', num: ['pro_labore'], str: ['name', 'role', 'personal_bank', 'personal_agency', 'personal_account', 'cpf', 'photo'] },
  equipment: { key: 'name', num: ['value', 'lifespan'], str: ['name'] },
  vehicles: { key: 'name', num: ['installment', 'maintenance_monthly', 'insurance_annual', 'ipva_annual'], str: ['name'] },
  fees_cards: { key: 'provider', num: ['debit_rate', 'credit_rate'], str: ['provider', 'custom_provider'] },
  fees_marketplaces: { key: 'provider', num: ['commission', 'sales_percentage', 'monthly_fee'], str: ['provider', 'custom_provider'] },
};

async function main() {
  const list = await prisma.client.findMany({ select: { id: true, data: true } });
  const stats = {}; for (const L of Object.keys(LISTS)) stats[L] = { total: 0, unmatched: 0, miss: {}, lossy: new Set() };
  const OBJ_GROUPS = ['location_costs', 'utilities', 'recurring_services', 'operational_fixed', 'admin_systems', 'marketing_structure'];
  const ARR_GROUPS = ['monthly_services', 'other_fixed_costs'];
  const co = { objKeys: 0, objMiss: 0, objLossy: new Set(), arrItems: 0, arrMiss: 0, arrCount: 0 };

  for (const c of list) {
    let d; try { d = JSON.parse(c.data || '{}'); } catch { continue; }
    const fd = d.formData || {};
    const rec = await reconstructCustos(db, s, c.id, fd);
    for (const [L, cfg] of Object.entries(LISTS)) {
      const blob = fd[L] || []; if (!blob.length) continue;
      const rb = rec[L] || [];
      // cards/marketplaces com provider 'Outra'/'Outro' têm identidade em custom_provider
      const effKey = (it) => {
        if (L === 'fees_cards' || L === 'fees_marketplaces') { const p = it.provider; return norm((p === 'Outra' || p === 'Outro') ? (it.custom_provider || p) : p); }
        return norm(it[cfg.key]);
      };
      // Map de ARRAYS + consumo (shift): pareia itens sem id de nome duplicado
      const rByKey = new Map();
      for (const x of rb) { const k = effKey(x); if (!rByKey.has(k)) rByKey.set(k, []); rByKey.get(k).push(x); }
      for (const b of blob) {
        if (!b || (!b.name && !b.provider)) continue;
        stats[L].total++;
        const arr = rByKey.get(effKey(b));
        const r = arr && arr.length ? arr.shift() : null;
        if (!r) { stats[L].unmatched++; continue; }
        for (const k of Object.keys(b)) { if (b[k] !== '' && b[k] != null && !(k in r)) stats[L].lossy.add(k); }
        for (const f of cfg.num) { if (b[f] !== undefined && b[f] !== '' && !numEq(b[f], r[f])) stats[L].miss[f] = (stats[L].miss[f] || 0) + 1; }
        for (const f of cfg.str) { if (b[f] !== undefined && b[f] !== '' && !strEq(b[f], r[f])) stats[L].miss[f] = (stats[L].miss[f] || 0) + 1; }
      }
    }
    // objetos de custo (rawValue = string exata → strEq)
    for (const g of OBJ_GROUPS) {
      const bo = fd[g]; if (!bo || typeof bo !== 'object' || Array.isArray(bo)) continue;
      const ro = rec[g] || {};
      for (const [k, v] of Object.entries(bo)) {
        if (v == null || v === '') continue; co.objKeys++;
        if (!(k in ro)) co.objLossy.add(g + '.' + k);
        else if (!strEq(v, ro[k]) && !numEq(v, ro[k])) co.objMiss++;
      }
    }
    for (const g of ARR_GROUPS) {
      const ba = fd[g] || []; const ra = rec[g] || [];
      if (ba.length !== ra.length) co.arrCount++;
      for (let i = 0; i < ba.length; i++) { co.arrItems++; const b = ba[i] || {}, r = ra[i] || {}; if (!strEq(b.name, r.name) || (!strEq(b.value, r.value) && !numEq(b.value, r.value))) co.arrMiss++; }
    }
  }
  console.log(`=== F3 round-trip (custos: 6 listas + objetos de custo) — ${list.length} clientes ===\n`);
  let allOk = true;
  for (const [L, st] of Object.entries(stats)) {
    const missK = Object.keys(st.miss);
    const ok = !st.unmatched && !missK.length && !st.lossy.size;
    if (!ok) allOk = false;
    console.log(`${ok ? '✅' : '⚠️ '} ${L.padEnd(18)} itens=${st.total} unmatched=${st.unmatched}` +
      (missK.length ? ` | campos: ${missK.map((k) => k + '(' + st.miss[k] + ')').join(', ')}` : '') +
      (st.lossy.size ? ` | LOSSY: ${[...st.lossy].join(',')}` : ''));
  }
  const coOk = !co.objMiss && !co.objLossy.size && !co.arrMiss && !co.arrCount;
  console.log(`${coOk ? '✅' : '⚠️ '} objetos de custo    chaves=${co.objKeys} miss=${co.objMiss}` +
    (co.objLossy.size ? ` LOSSY=${[...co.objLossy].join(',')}` : '') +
    ` | arrays itens=${co.arrItems} miss=${co.arrMiss} countDiff=${co.arrCount}`);
  console.log(`\n>>> CUSTOS (6 listas + objetos) fiel? ${allOk && coOk ? 'SIM ✅' : 'NÃO ⚠️'}`);
}
main().catch((e) => { console.error('Falha:', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
