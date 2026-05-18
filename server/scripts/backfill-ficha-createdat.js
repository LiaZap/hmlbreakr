/**
 * BACKFILL — createdAt nas fichas técnicas (e insumos) legados
 *
 * A partir de 2026-05-18 toda ficha nova grava `createdAt` na criação.
 * As fichas antigas (criadas antes) não têm o campo — então não exibem
 * a data "criada em DD/MM" no app.
 *
 * Este script popula `createdAt` retroativamente em TODAS as fichas e
 * insumos que não têm o campo, usando o `lastUpdated` que elas já
 * carregam como melhor aproximação disponível da data.
 *
 * - Só toca itens SEM `createdAt` (idempotente — pode rodar de novo).
 * - Se o item não tem `lastUpdated`, NÃO inventa data — deixa sem
 *   (honestidade: melhor não exibir do que exibir data errada).
 * - Cria um ClientDataSnapshot antes de alterar cada cliente (segurança).
 * - Não altera mais nada no Client.data.
 *
 * Uso:
 *   node scripts/backfill-ficha-createdat.js            # todos os clientes
 *   node scripts/backfill-ficha-createdat.js --dry-run  # só relata, não grava
 *   node scripts/backfill-ficha-createdat.js --hash=abc # um cliente só
 */

const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { createSnapshot, pruneOldSnapshots } = require('../src/services/snapshotService');

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const hashArg = (args.find(a => a.startsWith('--hash=')) || '').split('=')[1] || null;

// Timestamp válido? (epoch ms positivo)
const validTs = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

// Preenche createdAt num array de itens (fichas ou insumos). Retorna nº tocado.
function backfillItems(items) {
  if (!Array.isArray(items)) return 0;
  let touched = 0;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    // Já tem createdAt válido? pula.
    if (validTs(item.createdAt)) continue;
    // Usa lastUpdated como melhor aproximação. Sem isso, não inventa.
    if (validTs(item.lastUpdated)) {
      item.createdAt = item.lastUpdated;
      touched++;
    }
  }
  return touched;
}

async function main() {
  console.log('🔄 Backfill createdAt nas fichas/insumos legados');
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

  let clientsUpdated = 0;
  let totalFichas = 0;
  let totalInsumos = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of clients) {
    let data;
    try {
      data = JSON.parse(c.data || '{}');
    } catch {
      console.log(`  ⚠️  ${c.name} — data corrompido, pulando`);
      skipped++;
      continue;
    }

    const op = data && data.operational;
    if (!op || typeof op !== 'object') {
      skipped++;
      continue;
    }

    const fichasTouched = backfillItems(op.fichas);
    const insumosTouched = backfillItems(op.insumos);

    if (fichasTouched === 0 && insumosTouched === 0) {
      skipped++;
      continue;
    }

    totalFichas += fichasTouched;
    totalInsumos += insumosTouched;

    if (dryRun) {
      console.log(`  🔍 ${c.name} — ${fichasTouched} ficha(s) + ${insumosTouched} insumo(s) ganhariam createdAt`);
      clientsUpdated++;
      continue;
    }

    try {
      // Snapshot de segurança antes de alterar (reason marcada).
      try {
        await createSnapshot(prisma, c.id, c.data, 'pre-backfill-createdat');
      } catch (snapErr) {
        console.error(`  ⚠️  ${c.name} — snapshot pré-backfill falhou (continuando):`, snapErr.message);
      }
      await prisma.client.update({
        where: { id: c.id },
        data: { data: JSON.stringify(data) },
      });
      pruneOldSnapshots(prisma, c.id, 20).catch(() => {});
      console.log(`  ✅ ${c.name} — ${fichasTouched} ficha(s) + ${insumosTouched} insumo(s)`);
      clientsUpdated++;
    } catch (err) {
      console.error(`  ❌ ${c.name} (${c.hash}) — falhou:`, err.message);
      failed++;
    }
  }

  console.log(`\n✅ Concluído — ${clientsUpdated} cliente(s) atualizado(s), ${skipped} sem alteração, ${failed} com erro.`);
  console.log(`   Total: ${totalFichas} fichas + ${totalInsumos} insumos ganharam createdAt.`);
}

main()
  .catch(err => {
    console.error('❌ Erro fatal no backfill:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
