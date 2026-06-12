'use strict';
/**
 * f3-roundtrip-residuo.js — PORTÃO do resíduo (identity/user/profile/restaurant/
 * user_info/metric_snapshots). Reconstrói de CompanyProfile+MetricSnapshot e
 * compara com o blob. Imagens = fallback do blob (não contam como divergência).
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { db, pool } = require('../src/db/client');
const s = require('../src/db/schema');
const { reconstructResidue } = require('../src/services/coreRead');

const prisma = new PrismaClient();
const strEq = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();
const numEq = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005;
const IMG = new Set(['logo', 'photo', 'business_logo', 'user_photo']);  // base64 = fallback

async function main() {
  const list = await prisma.client.findMany({ select: { id: true, data: true } });
  const miss = {}; const lossy = new Set(); let clients = 0, msMiss = 0;
  // user_info NÃO migra (colapsa user_phone com profile.phone) → fica no blob.
  const OBJS = [['restaurant', (d) => d.restaurant], ['user', (d) => d.user], ['profile', (d) => d.profile],
    ['identity', (d) => d.formData?.identity]];

  for (const c of list) {
    let d; try { d = JSON.parse(c.data || '{}'); } catch { continue; }
    const r = await reconstructResidue(db, s, c.id, d);
    if (!r) continue;
    clients++;
    for (const [name, getter] of OBJS) {
      const bo = getter(d); if (!bo || typeof bo !== 'object') continue;
      const ro = name === 'identity' || name === 'user_info' ? r[name] : r[name];
      for (const [k, v] of Object.entries(bo)) {
        if (v == null || v === '' || IMG.has(k)) continue;  // imagens via fallback
        if (!(k in ro)) lossy.add(name + '.' + k);
        else if (!strEq(v, ro[k]) && !numEq(v, ro[k])) miss[name + '.' + k] = (miss[name + '.' + k] || 0) + 1;
      }
    }
    // metric_snapshots: drivers exatos por período
    const bms = d.formData?.metric_snapshots || {};
    for (const [pk, drv] of Object.entries(bms)) {
      const rdrv = r.metric_snapshots[pk];
      if (!rdrv) { msMiss++; continue; }
      for (const [k, v] of Object.entries(drv || {})) { if (!numEq(v, rdrv[k])) { msMiss++; break; } }
    }
  }
  console.log(`=== F3 round-trip (resíduo) — ${clients} clientes c/ CompanyProfile ===`);
  console.log('Campos divergentes (texto):');
  const k = Object.keys(miss).sort((a, b) => miss[b] - miss[a]);
  if (!k.length) console.log('  (nenhum) ✅'); else for (const f of k) console.log(`  ✗ ${f.padEnd(24)} ${miss[f]}`);
  console.log('Chaves NÃO reconstruídas (lossy, fora imagens):', lossy.size ? [...lossy].join(', ') : '(nenhuma) ✅');
  console.log('metric_snapshots divergentes:', msMiss);
  console.log(`\n>>> RESÍDUO fiel (texto+snapshots; imagens via fallback)? ${(!k.length && !lossy.size && !msMiss) ? 'SIM ✅' : 'NÃO ⚠️'}`);
}
main().catch((e) => { console.error('Falha:', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
