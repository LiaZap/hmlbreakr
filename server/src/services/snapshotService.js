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
 * bloqueia o save principal). pruneOldSnapshots mantém só os N mais
 * recentes pra não inflar o banco.
 *
 * Em 29/05/2026 aumentamos default 20 → 50 (Pampa Entreveiro perdeu
 * histórico do dia 10 porque 56 saves consecutivos em 1 dia pruneram
 * tudo). 50 * ~1MB ≈ 50MB por cliente ativo — aceitável.
 *
 * Helpers admin permitem listar e restaurar snapshots via UI.
 *
 * Migrado de Prisma → Drizzle (usa db + schema-bpo direto; sem param `prisma`).
 */
const crypto = require('crypto');
const { eq, and, desc, notInArray } = require('drizzle-orm');
const { db } = require('../db/client');
const s = require('../db/schema-bpo');

/**
 * Cria snapshot do data atual do cliente. NÃO valida se é JSON válido —
 * armazena a string crua pra preservar inclusive estados corrompidos.
 * @returns {Promise<{id: string, size: number}>}
 */
async function createSnapshot(clientId, currentData, reason = 'auto') {
  if (!clientId) throw new Error('createSnapshot: clientId é obrigatório');
  if (typeof currentData !== 'string') {
    currentData = currentData == null ? '' : String(currentData);
  }
  const size = Buffer.byteLength(currentData, 'utf8');
  const [snap] = await db.insert(s.clientDataSnapshot)
    .values({ id: crypto.randomUUID(), clientId, data: currentData, size, reason: reason || 'auto' })
    .returning({ id: s.clientDataSnapshot.id, size: s.clientDataSnapshot.size, createdAt: s.clientDataSnapshot.createdAt, reason: s.clientDataSnapshot.reason });
  return snap;
}

/**
 * Deleta snapshots antigos do cliente mantendo só os N mais recentes. Best-effort.
 * @returns {Promise<{deleted: number}>}
 */
async function pruneOldSnapshots(clientId, keepLast = 50) {
  if (!clientId) return { deleted: 0 };
  const keep = Math.max(1, Number(keepLast) || 50);
  const recent = await db.select({ id: s.clientDataSnapshot.id }).from(s.clientDataSnapshot)
    .where(eq(s.clientDataSnapshot.clientId, clientId))
    .orderBy(desc(s.clientDataSnapshot.createdAt)).limit(keep);
  const keepIds = recent.map((r) => r.id);
  if (keepIds.length === 0) return { deleted: 0 };
  const res = await db.delete(s.clientDataSnapshot)
    .where(and(eq(s.clientDataSnapshot.clientId, clientId), notInArray(s.clientDataSnapshot.id, keepIds)));
  return { deleted: res.rowCount ?? 0 };
}

/**
 * Lista snapshots de um cliente, omitindo o campo `data` (pesado). Mais recente primeiro.
 */
async function listSnapshots(clientId) {
  if (!clientId) return [];
  return db.select({ id: s.clientDataSnapshot.id, size: s.clientDataSnapshot.size, reason: s.clientDataSnapshot.reason, createdAt: s.clientDataSnapshot.createdAt })
    .from(s.clientDataSnapshot)
    .where(eq(s.clientDataSnapshot.clientId, clientId))
    .orderBy(desc(s.clientDataSnapshot.createdAt));
}

/**
 * Retorna o snapshot completo (com `data`) — usado pra restore/preview.
 * @returns {Promise<object|null>}
 */
async function getSnapshot(snapshotId) {
  if (!snapshotId) return null;
  const [row] = await db.select().from(s.clientDataSnapshot).where(eq(s.clientDataSnapshot.id, snapshotId)).limit(1);
  return row || null;
}

module.exports = {
  createSnapshot,
  pruneOldSnapshots,
  listSnapshots,
  getSnapshot,
};
