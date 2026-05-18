/**
 * auditService — Trilha de auditoria do Breaker.
 *
 * O QUE FAZ
 * Centraliza a escrita e a leitura da tabela `AuditLog` (model Prisma
 * append-only). Toda ação administrativa ou de sistema relevante deve gerar
 * um registro aqui: quem fez (actor), o que (action), em qual entidade
 * (entityType/entityId), quando (createdAt) e detalhes (metadata).
 *
 * O AuditLog é IMUTÁVEL — nunca recebe UPDATE nem DELETE. Não tem FK, então
 * sobrevive a soft-deletes das entidades referenciadas.
 *
 * PADRÃO DE USO
 *   const { logAudit } = require('../services/auditService');
 *   await logAudit(prisma, {
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
 * IMPORTANTE: `logAudit` é BEST-EFFORT. Nunca lança exceção — uma falha de
 * auditoria não pode quebrar a operação de negócio que a chamou. Em caso de
 * erro, registra no console com prefixo `[auditService]` e retorna null.
 *
 * Princípio SOLID — Dependency Inversion: o `prisma` é recebido como
 * parâmetro, o service não instancia client próprio.
 */

/**
 * Registra uma entrada na trilha de auditoria. Best-effort: nunca lança.
 *
 * @param {import('@prisma/client').PrismaClient} prisma - client Prisma
 * @param {Object} entry
 * @param {string} entry.action - ex: 'client.data_sync', 'admin.login'
 * @param {string} entry.entityType - 'client' | 'admin_user' | 'broadcast' | 'team_member' | 'system'
 * @param {string} [entry.entityId] - id da entidade afetada
 * @param {string} entry.actorType - 'client' | 'team_member' | 'admin' | 'system'
 * @param {string} [entry.actorId] - id do ator
 * @param {string} [entry.actorLabel] - email/nome legível do ator
 * @param {string} [entry.summary] - descrição curta legível
 * @param {Object|string} [entry.metadata] - detalhes; objeto vira JSON string
 * @returns {Promise<Object|null>} registro criado, ou null em caso de erro
 */
async function logAudit(prisma, entry = {}) {
  try {
    const {
      action,
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

    const record = await prisma.auditLog.create({
      data: {
        action: String(action),
        entityType: String(entityType),
        entityId: entityId != null ? String(entityId) : null,
        actorType: String(actorType),
        actorId: actorId != null ? String(actorId) : null,
        actorLabel: actorLabel != null ? String(actorLabel) : null,
        summary: summary != null ? String(summary) : null,
        metadata: metadataStr,
      },
    });

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
 * @param {import('@prisma/client').PrismaClient} prisma - client Prisma
 * @param {Object} [filters]
 * @param {string} [filters.entityType] - filtra por tipo de entidade
 * @param {string} [filters.entityId] - filtra por id da entidade
 * @param {string} [filters.action] - filtra por ação
 * @param {string} [filters.actorType] - filtra por tipo de ator
 * @param {string|Date} [filters.fromDate] - createdAt >= fromDate
 * @param {string|Date} [filters.toDate] - createdAt <= toDate
 * @param {number} [filters.limit=100] - máximo de itens
 * @param {number} [filters.offset=0] - deslocamento (paginação)
 * @returns {Promise<{ items: Object[], total: number }>}
 */
async function listAudit(prisma, filters = {}) {
  const {
    entityType,
    entityId,
    action,
    actorType,
    fromDate,
    toDate,
    limit = 100,
    offset = 0,
  } = filters;

  // Monta o WHERE só com os filtros realmente informados
  const where = {};
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (action) where.action = action;
  if (actorType) where.actorType = actorType;

  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt.gte = new Date(fromDate);
    if (toDate) where.createdAt.lte = new Date(toDate);
  }

  // Sanitiza paginação
  const take = Math.max(1, Math.min(Number(limit) || 100, 1000));
  const skip = Math.max(0, Number(offset) || 0);

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total };
}

module.exports = { logAudit, listAudit };
