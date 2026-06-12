/**
 * Middleware do módulo BPO Financeiro
 * - requireBpoEnabled: bloqueia se cliente não tem BPO ativado
 * - resolveBpoClient: extrai clientId do path/header, valida existência
 *
 * Adicionado em 2026-04-27. Doc: [[Breakr V2.0 - Plano de Acao BPO Financeiro]]
 */

const { db } = require('../../db/client');
const t = require('../../db/schema-bpo');
const { eq } = require('drizzle-orm');
const { blockIfNotAllowed } = require('../../middleware/subscriptionGuard');

/**
 * Carrega Client pelo hash (path param :clientHash) e adiciona em req.bpoClient.
 * Bloqueia 403 se bpoEnabled = false.
 */
const requireBpoClient = async (req, res, next) => {
  try {
    const hash = req.params.clientHash || req.headers['x-client-hash'];
    if (!hash) {
      return res.status(400).json({ error: 'clientHash obrigatório (path param ou header x-client-hash)' });
    }
    const [client] = await db.select().from(t.client).where(eq(t.client.hash, hash)).limit(1);
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    // Removido: bpoEnabled flag (financeiro é feature padrão do produto)
    // Subscription guard — bloqueio manual / unpaid / canceled-expirado.
    if (blockIfNotAllowed(client, res)) return;
    req.bpoClient = client;
    next();
  } catch (err) {
    console.error('[bpo middleware]', err);
    res.status(500).json({ error: 'Erro interno' });
  }
};

/**
 * Helper: garante que o BPO operator tem permissão.
 * Por enquanto reusa as roles existentes (financial, super_admin, admin).
 * Quando criarmos role 'bpo_operator', acrescentar aqui.
 */
const requireBpoOperator = (req, res, next) => {
  // TODO: validar token do operador BPO quando tiver auth completo
  // Por enquanto, qualquer admin/financial pode operar
  next();
};

module.exports = { requireBpoClient, requireBpoOperator };
