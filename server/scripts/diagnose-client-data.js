/**
 * diagnose-client-data.js — diagnostica perda de dados em um cliente
 * e lista snapshots disponiveis pra restauracao.
 *
 * Util quando um cliente reporta "perdi meus dados" — verifica o tamanho
 * atual de Client.data, lista todos os ClientDataSnapshot ordenados por
 * data (com tamanho e razao), e identifica qual snapshot eh o melhor
 * candidato pra restaurar (maior + mais recente, exceto pos-incidente).
 *
 * Uso:
 *   node scripts/diagnose-client-data.js <hash>
 *
 * Exemplo:
 *   node scripts/diagnose-client-data.js l961uanr9xex82901usrd
 *
 * Saida (em ordem):
 *   1. Dados do cliente (id, nome, email, ativo, BPO)
 *   2. Estado atual de Client.data (tamanho, campos principais, integridade)
 *   3. Lista dos ultimos 20 snapshots (data, tamanho, razao, delta)
 *   4. Recomendacao de qual snapshot restaurar
 *
 * Read-only — nao altera nada. Pra restaurar de fato, use a API admin:
 *   POST /api/admin/clients/:clientId/snapshots/:snapshotId/restore
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const hash = process.argv[2];
if (!hash) {
  console.error('\n❌ Uso: node scripts/diagnose-client-data.js <hash>');
  console.error('   Exemplo: node scripts/diagnose-client-data.js l961uanr9xex82901usrd\n');
  process.exit(1);
}

const fmtBytes = (b) => {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(2) + ' MB';
};

const fmtDate = (d) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

const safeParseFields = (jsonStr) => {
  try {
    const d = JSON.parse(jsonStr || '{}');
    return {
      hasUser: !!d.user,
      userName: d.user?.name || '(vazio)',
      hasRestaurant: !!d.restaurant,
      restaurantName: d.restaurant?.name || '(vazio)',
      onboardingCompleted: d.onboarding?.completed === true,
      onboardingStep: d.onboarding?.step ?? 'N/A',
      fichasCount: (d.operational?.fichas || []).length,
      insumosCount: (d.operational?.insumos || []).length,
      hasFormData: !!d.formData,
      formDataKeys: d.formData ? Object.keys(d.formData).length : 0,
    };
  } catch (e) {
    return { error: 'JSON invalido: ' + e.message };
  }
};

(async () => {
  try {
    // 1. Encontra o cliente
    const client = await prisma.client.findUnique({
      where: { hash },
      select: {
        id: true, hash: true, name: true, email: true, active: true,
        bpoEnabled: true, createdAt: true, updatedAt: true, data: true,
      },
    });
    if (!client) {
      console.error(`\n❌ Cliente com hash "${hash}" nao encontrado.\n`);
      process.exit(1);
    }

    const currentSize = (client.data || '').length;
    const currentFields = safeParseFields(client.data);

    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  CLIENTE');
    console.log('══════════════════════════════════════════════════════════');
    console.log(`  ID:           ${client.id}`);
    console.log(`  Hash:         ${client.hash}`);
    console.log(`  Nome:         ${client.name}`);
    console.log(`  Email:        ${client.email || '(sem email)'}`);
    console.log(`  Ativo:        ${client.active}`);
    console.log(`  BPO ativado:  ${client.bpoEnabled}`);
    console.log(`  Criado em:    ${fmtDate(client.createdAt)}`);
    console.log(`  Atualiz. em:  ${fmtDate(client.updatedAt)}`);

    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  ESTADO ATUAL DE Client.data');
    console.log('══════════════════════════════════════════════════════════');
    console.log(`  Tamanho:                ${fmtBytes(currentSize)} (${currentSize} bytes)`);
    if (currentFields.error) {
      console.log(`  ⚠️  JSON QUEBRADO:       ${currentFields.error}`);
    } else {
      console.log(`  user.name:              ${currentFields.userName}`);
      console.log(`  restaurant.name:        ${currentFields.restaurantName}`);
      console.log(`  onboarding.completed:   ${currentFields.onboardingCompleted}`);
      console.log(`  onboarding.step:        ${currentFields.onboardingStep}`);
      console.log(`  formData (chaves):      ${currentFields.formDataKeys}`);
      console.log(`  fichas:                 ${currentFields.fichasCount}`);
      console.log(`  insumos:                ${currentFields.insumosCount}`);
    }

    // 2. Lista snapshots
    const snapshots = await prisma.clientDataSnapshot.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, createdAt: true, size: true, reason: true },
    });

    console.log('\n══════════════════════════════════════════════════════════');
    console.log(`  SNAPSHOTS (${snapshots.length} encontrados, mais recentes primeiro)`);
    console.log('══════════════════════════════════════════════════════════');

    if (snapshots.length === 0) {
      console.log('  ⚠️  Nenhum snapshot disponivel — cliente nao tem historico de save.');
      console.log('     (Snapshots so existem pra clientes que salvaram dados via /client/:hash/sync)\n');
      await prisma.$disconnect();
      return;
    }

    let prevSize = currentSize;
    snapshots.forEach((s, i) => {
      const delta = s.size - prevSize;
      const deltaStr = delta === 0 ? '' : ` (${delta > 0 ? '+' : ''}${fmtBytes(delta)})`;
      const flag = s.size > currentSize * 1.5 ? ' 🟢 MAIOR QUE ATUAL' : s.reason === 'auto-shrink-detected' ? ' ⚠️  SHRINK DETECTADO' : '';
      console.log(`  ${String(i + 1).padStart(2)}. ${fmtDate(s.createdAt)}  ${fmtBytes(s.size).padStart(10)}  [${(s.reason || 'auto').padEnd(22)}]${flag}`);
      console.log(`      ID: ${s.id}${deltaStr}`);
      prevSize = s.size;
    });

    // 3. Recomendacao
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  RECOMENDACAO');
    console.log('══════════════════════════════════════════════════════════');

    // Encontra o snapshot mais antigo (mais "rico" provavelmente) que NAO seja
    // post-incidente. Critério: maior 'size' antes do tamanho atual cair.
    const biggestSnapshot = snapshots
      .filter(s => s.reason !== 'auto-shrink-detected' && s.reason !== 'pre-restore')
      .reduce((max, s) => s.size > max.size ? s : max, { size: 0 });

    if (biggestSnapshot.id) {
      const ratio = ((biggestSnapshot.size / Math.max(currentSize, 1)) * 100).toFixed(0);
      console.log(`  Melhor candidato pra restaurar:`);
      console.log(`    ID:        ${biggestSnapshot.id}`);
      console.log(`    Data:      ${fmtDate(biggestSnapshot.createdAt)}`);
      console.log(`    Tamanho:   ${fmtBytes(biggestSnapshot.size)} (${ratio}% do atual)`);
      console.log(`    Razao:     ${biggestSnapshot.reason || 'auto'}`);
      console.log('\n  Pra restaurar (via API admin, requer super_admin):');
      console.log(`    POST /api/admin/clients/${client.id}/snapshots/${biggestSnapshot.id}/restore`);
      console.log('\n  OU rode o script:');
      console.log(`    node scripts/restore-snapshot.js ${client.id} ${biggestSnapshot.id}\n`);
    } else {
      console.log('  ⚠️  Nenhum snapshot valido encontrado pra restauracao.\n');
    }

    await prisma.$disconnect();
  } catch (err) {
    console.error('\n❌ Erro:', err.message);
    console.error(err.stack);
    await prisma.$disconnect();
    process.exit(1);
  }
})();
