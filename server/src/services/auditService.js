/**
 * auditService — Trilha de auditoria do Breaker.
 *
 * O QUE FAZ
 * Centraliza a escrita e a leitura da tabela `AuditLog` (append-only). Toda
 * ação administrativa ou de sistema relevante deve gerar um registro aqui:
 * quem fez (actor), o que (action), em qual entidade (entityType/entityId),
 * quando (createdAt) e detalhes (metadata).
 *
 * O AuditLog é IMUTÁVEL — nunca recebe UPDATE nem DELETE. Não tem FK, então
 * sobrevive a soft-deletes das entidades referenciadas.
 *
 * PADRÃO DE USO (assinatura nova, sem prisma):
 *   const { logAudit } = require('../services/auditService');
 *   await logAudit({
 *     action: 'client.data_sync',
 *     entityType: 'client',
 *     entityId: client.id,
 *     actorType: 'admin',
 *     actorId: req.adminUser?.id,
 *     actorLabel: req.adminUser?.email,
 *     summary: 'Sync de dados do cliente',
 *     metadata: { sizeBefore: 1234, sizeAfter: 1240, shrink: false },
 *   });
 *
 * Migrado de Prisma → Drizzle (2026-06-12). Para não quebrar os ~30 callers de
 * uma vez, a assinatura é RETROCOMPATÍVEL: aceita tanto `logAudit(entry)`
 * quanto o antigo `logAudit(prisma, entry)` (o primeiro arg é ignorado se o
 * segundo existir). Mesma coisa pra `listAudit`.
 *
 * IMPORTANTE: `logAudit` é BEST-EFFORT. Nunca lança exceção — uma falha de
 * auditoria não pode quebrar a operação de negócio que a chamou. Em caso de
 * erro, registra no console com prefixo `[auditService]` e retorna null.
 */

const crypto = require('crypto');
const { and, eq, gte, lte, desc, count } = require('drizzle-orm');
const { db } = require('../db/client');
const { auditLog } = require('../db/schema-bpo');

/**
 * Normaliza os argumentos pra suportar as duas assinaturas:
 *   fn(entry)           → retorna entry
 *   fn(prisma, entry)   → ignora prisma, retorna entry
 */
function pickArg(a, b) {
  return b === undefined ? (a || {}) : (b || {});
}

/**
 * Registra uma entrada na trilha de auditoria. Best-effort: nunca lança.
 *
 * @param {Object} entry (ou prisma legado + entry)
 * @param {string} entry.action - ex: 'client.data_sync', 'admin.login'
 * @param {string} [entry.category] - 'security' | 'data' | 'bpo' | 'admin' | 'system'
 * @param {string} entry.entityType - 'client' | 'admin_user' | 'broadcast' | 'team_member' | 'system'
 * @param {string} [entry.entityId] - id da entidade afetada
 * @param {string} entry.actorType - 'client' | 'team_member' | 'admin' | 'system'
 * @param {string} [entry.actorId] - id do ator
 * @param {string} [entry.actorLabel] - email/nome legível do ator
 * @param {string} [entry.summary] - descrição curta legível
 * @param {Object|string} [entry.metadata] - detalhes; objeto vira JSON string
 * @returns {Promise<Object|null>} registro criado, ou null em caso de erro
 */
async function logAudit(a, b) {
  try {
    const entry = pickArg(a, b);
    const {
      action,
      category,
      entityType,
      entityId,
      actorType,
      actorId,
      actorLabel,
      summary,
      metadata,
    } = entry;

    // Validação mínima dos campos obrigatórios
    if (!action || !entityType || !actorType) {
      console.error(
        '[auditService] logAudit: action, entityType e actorType são obrigatórios — registro ignorado',
        { action, entityType, actorType }
      );
      return null;
    }

    // metadata pode vir como objeto → serializar; string passa direto
    let metadataStr = null;
    if (metadata != null) {
      metadataStr =
        typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
    }

    const [record] = await db
      .insert(auditLog)
      .values({
        id: crypto.randomUUID(),
        action: String(action),
        category: category != null ? String(category) : null,
        entityType: String(entityType),
        entityId: entityId != null ? String(entityId) : null,
        actorType: String(actorType),
        actorId: actorId != null ? String(actorId) : null,
        actorLabel: actorLabel != null ? String(actorLabel) : null,
        summary: summary != null ? String(summary) : null,
        metadata: metadataStr,
      })
      .returning();

    return record;
  } catch (err) {
    // Best-effort: nunca propaga o erro pra não quebrar a operação chamadora
    console.error('[auditService] logAudit falhou:', err?.message || err);
    return null;
  }
}

/**
 * Lista registros da trilha de auditoria com filtros opcionais.
 * Ordena por createdAt desc (mais recentes primeiro).
 *
 * @param {Object} [filters] (ou prisma legado + filters)
 * @param {string} [filters.entityType] - filtra por tipo de entidade
 * @param {string} [filters.entityId] - filtra por id da entidade
 * @param {string} [filters.action] - filtra por ação
 * @param {string} [filters.category] - filtra por categoria (ex: 'security')
 * @param {string} [filters.actorType] - filtra por tipo de ator
 * @param {string|Date} [filters.fromDate] - createdAt >= fromDate
 * @param {string|Date} [filters.toDate] - createdAt <= toDate
 * @param {number} [filters.limit=100] - máximo de itens
 * @param {number} [filters.offset=0] - deslocamento (paginação)
 * @returns {Promise<{ items: Object[], total: number }>}
 */
async function listAudit(a, b) {
  const filters = pickArg(a, b);
  const {
    entityType,
    entityId,
    action,
    category,
    actorType,
    fromDate,
    toDate,
    limit = 100,
    offset = 0,
  } = filters;

  // Monta o WHERE só com os filtros realmente informados
  const conds = [];
  if (entityType) conds.push(eq(auditLog.entityType, entityType));
  if (entityId) conds.push(eq(auditLog.entityId, entityId));
  if (action) conds.push(eq(auditLog.action, action));
  if (category) conds.push(eq(auditLog.category, category));
  if (actorType) conds.push(eq(auditLog.actorType, actorType));
  // createdAt é mode:'string' — comparações usam ISO string
  if (fromDate) conds.push(gte(auditLog.createdAt, new Date(fromDate).toISOString()));
  if (toDate) conds.push(lte(auditLog.createdAt, new Date(toDate).toISOString()));

  const where = conds.length ? and(...conds) : undefined;

  // Sanitiza paginação
  const take = Math.max(1, Math.min(Number(limit) || 100, 1000));
  const skip = Math.max(0, Number(offset) || 0);

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(take)
      .offset(skip),
    db.select({ value: count() }).from(auditLog).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.value || 0) };
}

module.exports = { logAudit, listAudit };
