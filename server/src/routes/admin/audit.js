/**
 * Admin Audit — endpoint de listagem da trilha de auditoria.
 *
 * Expõe os eventos de auditoria registrados pelo sistema (ações
 * administrativas, sync de Client.data, etc.) para a tela "Auditoria"
 * do painel admin.
 *
 * Mount-point (em routes.js): /admin/audit — montado por outro agente.
 *
 * Endpoint:
 *   GET /admin/audit
 *     Query params (todos opcionais):
 *       entityType  filtra pelo tipo de entidade (ex: 'client')
 *       entityId    filtra por uma entidade específica
 *       action      filtra pela ação (ex: 'client.data_sync')
 *       category    filtra pela categoria (ex: 'security', 'data', 'bpo')
 *       actorType   filtra pelo tipo de ator (ex: 'admin', 'system')
 *       fromDate    ISO date — limite inferior do período
 *       toDate      ISO date — limite superior do período
 *       limit       paginação — quantidade (default no service)
 *       offset      paginação — deslocamento
 *     Retorna: { items, total }
 *
 * A lógica de query vive em services/auditService.js (SOLID — rota só
 * traduz HTTP <-> service).
 */

const express = require('express');
const { listAudit } = require('../../services/auditService');

const router = express.Router();

/**
 * GET /admin/audit
 * Lista eventos de auditoria com filtros e paginação.
 */
router.get('/', async (req, res) => {
  try {
    const {
      entityType,
      entityId,
      action,
      category,
      actorType,
      fromDate,
      toDate,
      limit,
      offset,
    } = req.query;

    // Normaliza paginação: aceita só inteiros não-negativos; valores
    // inválidos são descartados (deixa o service aplicar o default).
    const parsedLimit = Number.parseInt(limit, 10);
    const parsedOffset = Number.parseInt(offset, 10);

    const filters = {
      entityType: entityType || undefined,
      entityId: entityId || undefined,
      action: action || undefined,
      category: category || undefined,
      actorType: actorType || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
      offset: Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : undefined,
    };

    const { items, total } = await listAudit(filters);

    return res.json({ items, total });
  } catch (err) {
    console.error('[admin audit list] erro:', err);
    return res.status(500).json({ error: 'Erro ao listar auditoria' });
  }
});

module.exports = router;
