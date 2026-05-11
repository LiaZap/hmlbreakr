/**
 * snapshotService — versionamento do Client.data (JSON blob ~330KB).
 *
 * Contexto: o Client.data é um JSON string único que guarda TUDO do cliente
 * (onboarding, fichas, insumos, produtos, custos, revenue history...). Cada
 * save no /client/:hash/sync sobrescreve o campo inteiro. Em 2026-05-11 o
 * cliente Garapas teve metade dos dados sobrescritos por bug/usuário e
 * NÃO HAVIA HISTÓRICO — perda irrecuperável.
 *
 * Esse serviço cria snapshots imutáveis a cada save (best-effort, não
 * bloqueia o save principal). pruneOldSnapshots mantém só os 20 mais
 * recentes pra não inflar o banco (20 * 330KB ≈ 6.6MB por cliente — ok).
 *
 * Helpers admin permitem listar e restaurar snapshots via UI.
 */

/**
 * Cria snapshot do data atual do cliente. NÃO valida se é JSON válido —
 * armazena a string crua pra preservar inclusive estados corrompidos (que
 * podem ser úteis pra debug).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} clientId
 * @param {string} currentData — string JSON (ou qualquer string) já presente em Client.data
 * @param {string} [reason='auto'] — origem do snapshot
 * @returns {Promise<{id: string, size: number}>}
 */
async function createSnapshot(prisma, clientId, currentData, reason = 'auto') {
  if (!clientId) throw new Error('createSnapshot: clientId é obrigatório');
  if (typeof currentData !== 'string') {
    // Edge case: data vazio ou null. Salva como string vazia pra manter rastro.
    currentData = currentData == null ? '' : String(currentData);
  }
  const size = Buffer.byteLength(currentData, 'utf8');
  const snap = await prisma.clientDataSnapshot.create({
    data: {
      clientId,
      data: currentData,
      size,
      reason: reason || 'auto',
    },
    select: { id: true, size: true, createdAt: true, reason: true },
  });
  return snap;
}

/**
 * Deleta snapshots antigos do cliente mantendo só os N mais recentes.
 * Best-effort — falha silenciosa (apenas loga).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} clientId
 * @param {number} [keepLast=20]
 * @returns {Promise<{deleted: number}>}
 */
async function pruneOldSnapshots(prisma, clientId, keepLast = 20) {
  if (!clientId) return { deleted: 0 };
  const keep = Math.max(1, Number(keepLast) || 20);
  // Busca os IDs dos N mais recentes pra preservar
  const recent = await prisma.clientDataSnapshot.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    take: keep,
    select: { id: true },
  });
  const keepIds = recent.map((r) => r.id);
  if (keepIds.length === 0) return { deleted: 0 };
  const result = await prisma.clientDataSnapshot.deleteMany({
    where: {
      clientId,
      id: { notIn: keepIds },
    },
  });
  return { deleted: result.count };
}

/**
 * Lista snapshots de um cliente, omitindo o campo `data` (pesado).
 * Ordenado do mais recente pro mais antigo.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} clientId
 * @returns {Promise<Array<{id, size, reason, createdAt}>>}
 */
async function listSnapshots(prisma, clientId) {
  if (!clientId) return [];
  return prisma.clientDataSnapshot.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      size: true,
      reason: true,
      createdAt: true,
    },
  });
}

/**
 * Retorna o snapshot completo (com `data`) — usado pra restore/preview.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} snapshotId
 * @returns {Promise<object|null>}
 */
async function getSnapshot(prisma, snapshotId) {
  if (!snapshotId) return null;
  return prisma.clientDataSnapshot.findUnique({
    where: { id: snapshotId },
  });
}

module.exports = {
  createSnapshot,
  pruneOldSnapshots,
  listSnapshots,
  getSnapshot,
};
