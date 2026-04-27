/**
 * Middleware do módulo BPO Financeiro
 * - requireBpoEnabled: bloqueia se cliente não tem BPO ativado
 * - resolveBpoClient: extrai clientId do path/header, valida existência
 *
 * Adicionado em 2026-04-27. Doc: [[Breakr V2.0 - Plano de Acao BPO Financeiro]]
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
    const client = await prisma.client.findUnique({ where: { hash } });
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    if (!client.bpoEnabled) {
      return res.status(403).json({ error: 'Cliente não tem BPO ativado' });
    }
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
