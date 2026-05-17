/**
 * BACKFILL — Onboarding -> BPO (BAH-092)
 *
 * O syncOnboardingToBpo só roda quando o cliente salva o onboarding
 * (POST /client/:hash/sync). Clientes que preencheram ANTES do deploy do
 * BAH-092 não têm os Payables dos custos fixos — o Menu Financeiro deles
 * aparece zerado até o próximo save.
 *
 * Este script roda o sync pra TODOS os clientes existentes uma vez.
 * É idempotente (o sync usa tag determinística [onb:<key>]), então pode
 * ser rodado mais de uma vez sem duplicar dados.
 *
 * Uso:
 *   node scripts/backfill-onboarding-bpo.js            # todos os clientes
 *   node scripts/backfill-onboarding-bpo.js --dry-run  # só lista, não grava
 *   node scripts/backfill-onboarding-bpo.js --hash=abc # um cliente só
 */

const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { syncOnboardingToBpo } = require('../src/services/onboardingSync');

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const hashArg = (args.find(a => a.startsWith('--hash=')) || '').split('=')[1] || null;

async function main() {
  console.log('🔄 Backfill Onboarding -> BPO (BAH-092)');
  console.log(`   modo: ${dryRun ? 'DRY-RUN (não grava)' : 'GRAVAÇÃO'}${hashArg ? ` | cliente: ${hashArg}` : ''}\n`);

  const where = hashArg ? { hash: hashArg } : {};
  const clients = await prisma.client.findMany({
    where,
    select: { id: true, name: true, hash: true, data: true },
  });

  if (clients.length === 0) {
    console.log('Nenhum cliente encontrado.');
    return;
  }

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of clients) {
    let formData = null;
    try {
      const parsed = JSON.parse(c.data || '{}');
      formData = parsed.formData || null;
    } catch {
      console.log(`  ⚠️  ${c.name} (${c.hash}) — data corrompido, pulando`);
      skipped++;
      continue;
    }

    if (!formData || typeof formData !== 'object' || Object.keys(formData).length === 0) {
      console.log(`  ⏭️  ${c.name} — sem formData, pulando`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  🔍 ${c.name} — sincronizaria (dry-run)`);
      ok++;
      continue;
    }

    try {
      await syncOnboardingToBpo(prisma, c.id, formData);
      ok++;
    } catch (err) {
      console.error(`  ❌ ${c.name} (${c.hash}) — falhou:`, err.message);
      failed++;
    }
  }

  console.log(`\n✅ Concluído — ${ok} sincronizado(s), ${skipped} pulado(s), ${failed} com erro.`);
}

main()
  .catch(err => {
    console.error('❌ Erro fatal no backfill:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
