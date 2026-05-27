/**
 * restore-snapshot.js — restaura um snapshot especifico do Client.data.
 *
 * Faz EXATAMENTE o que a rota admin POST /clients/:id/snapshots/:snap/restore
 * faz, mas via CLI (util quando precisa rodar emergencialmente sem ter o
 * painel admin disponivel ou pra automacao).
 *
 * Seguranca:
 *   1. Antes do restore, gera um snapshot do estado ATUAL com
 *      reason='pre-restore' — permite desfazer caso de problema
 *   2. Aborta se o pre-restore snapshot falhar (nunca perde estado)
 *   3. Mostra preview do tamanho/conteudo antes de aplicar
 *   4. Pede confirmacao 'YES' digitado pra prosseguir
 *
 * Uso:
 *   node scripts/restore-snapshot.js <clientId> <snapshotId>
 *
 * Exemplo:
 *   node scripts/restore-snapshot.js abc-123 xyz-789
 *
 * Pra rodar sem prompt (CI/automacao):
 *   FORCE_YES=1 node scripts/restore-snapshot.js <clientId> <snapshotId>
 */
require('dotenv').config();
const readline = require('readline');
const { PrismaClient } = require('@prisma/client');
const { createSnapshot } = require('../src/services/snapshotService');
const prisma = new PrismaClient();

const [clientId, snapshotId] = process.argv.slice(2);
if (!clientId || !snapshotId) {
  console.error('\n❌ Uso: node scripts/restore-snapshot.js <clientId> <snapshotId>\n');
  process.exit(1);
}

const fmtBytes = (b) => b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b/1024).toFixed(1)} KB` : `${(b/1024/1024).toFixed(2)} MB`;
const fmtDate = (d) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

const ask = (q) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, (a) => { rl.close(); resolve(a.trim()); });
});

(async () => {
  try {
    // 1. Valida cliente
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, hash: true, name: true, email: true, data: true },
    });
    if (!client) { console.error(`❌ Cliente ${clientId} nao encontrado.`); process.exit(1); }

    // 2. Valida snapshot
    const snap = await prisma.clientDataSnapshot.findFirst({
      where: { id: snapshotId, clientId },
      select: { id: true, createdAt: true, size: true, reason: true, data: true },
    });
    if (!snap) { console.error(`❌ Snapshot ${snapshotId} nao encontrado pra esse cliente.`); process.exit(1); }

    const currentSize = (client.data || '').length;
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  RESTORE DE SNAPSHOT');
    console.log('══════════════════════════════════════════════════════════');
    console.log(`  Cliente:        ${client.name} (${client.email || 'sem email'})`);
    console.log(`  Hash:           ${client.hash}`);
    console.log(`  Tamanho atual:  ${fmtBytes(currentSize)}`);
    console.log('  ────────────────────────────────────────────────────────');
    console.log(`  Snapshot ID:    ${snap.id}`);
    console.log(`  Criado em:      ${fmtDate(snap.createdAt)}`);
    console.log(`  Tamanho:        ${fmtBytes(snap.size)}`);
    console.log(`  Razao:          ${snap.reason || 'auto'}`);
    console.log(`  Delta:          ${(snap.size - currentSize) > 0 ? '+' : ''}${fmtBytes(snap.size - currentSize)}`);
    console.log('══════════════════════════════════════════════════════════');

    // 3. Confirma (a nao ser que FORCE_YES=1)
    if (process.env.FORCE_YES !== '1') {
      const ans = await ask('\n⚠️  Confirma restore? Digite "YES" (em maiusculas) pra prosseguir: ');
      if (ans !== 'YES') {
        console.log('Cancelado.\n');
        await prisma.$disconnect();
        return;
      }
    }

    // 4. Pre-restore snapshot (estado atual vira backup, permite desfazer)
    console.log('\n[1/2] Criando pre-restore snapshot do estado atual...');
    try {
      await createSnapshot(prisma, clientId, client.data, 'pre-restore');
      console.log('      ✅ Pre-restore snapshot criado.');
    } catch (err) {
      console.error('      ❌ Falha ao criar pre-restore snapshot — restore ABORTADO.');
      console.error('         Motivo:', err.message);
      await prisma.$disconnect();
      process.exit(1);
    }

    // 5. Aplica o restore
    console.log('\n[2/2] Restaurando snapshot...');
    await prisma.client.update({
      where: { id: clientId },
      data: { data: snap.data },
    });
    console.log('      ✅ Client.data atualizado.');

    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  ✅ RESTORE CONCLUIDO');
    console.log('══════════════════════════════════════════════════════════');
    console.log(`  Cliente: ${client.name}`);
    console.log(`  Acesse:  https://app.breakr.com.br/?hash=${client.hash}`);
    console.log('  Caso de problema, o pre-restore snapshot foi criado e pode');
    console.log('  ser usado pra desfazer. Liste snapshots de novo pra ver.');
    console.log('══════════════════════════════════════════════════════════\n');

    await prisma.$disconnect();
  } catch (err) {
    console.error('\n❌ Erro:', err.message);
    console.error(err.stack);
    await prisma.$disconnect();
    process.exit(1);
  }
})();
