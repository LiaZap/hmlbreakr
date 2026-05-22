/**
 * Admin Auth Middleware — gating de rotas administrativas.
 *
 * V1: validação header-based (X-Admin-Token + X-Admin-User-Id).
 *   - X-Admin-Token: valor secreto compartilhado (.env ADMIN_TOKEN).
 *   - X-Admin-User-Id: id do AdminUser do banco; obrigatório para
 *     requireSuperAdmin (não há mais caminho legado por header).
 *
 * V2 (futuro): JWT por sessão (issuer/exp/role), Clerk SSO opcional.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ADMIN_TOKEN é obrigatório — sem fallback. Abortar startup se ausente
// previne deploy acidental sem secret (sec-auditor #3).
const VALID_TOKEN = process.env.ADMIN_TOKEN;
if (!VALID_TOKEN || VALID_TOKEN.length < 32) {
  throw new Error(
    '[adminAuth] ADMIN_TOKEN obrigatório (mínimo 32 chars). ' +
    'Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" ' +
    'e adicione em server/.env (dev) ou Easypanel env vars (prod).'
  );
}

/**
 * requireAdmin — valida que requisição vem de um admin logado.
 * Aceita:
 *   - X-Admin-Token: <ADMIN_TOKEN> (obrigatório)
 *   - X-Admin-User-Id: <uuid> (opcional, mas recomendado pra audit log)
 *
 * Coloca req.adminUser populado quando X-Admin-User-Id é válido.
 */
async function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || token !== VALID_TOKEN) {
    return res.status(401).json({ error: 'Não autenticado — login admin requerido' });
  }
  const userId = req.headers['x-admin-user-id'];
  if (userId) {
    try {
      const user = await prisma.adminUser.findUnique({ where: { id: String(userId) } });
      if (user && user.active) {
        req.adminUser = user;
      }
    } catch (e) {
      console.error('[adminAuth] lookup error', e?.message);
      // não bloqueia — apenas não popula req.adminUser
    }
  }
  next();
}

/**
 * requireSuperAdmin — exige role super_admin além do token válido.
 * Valida SEMPRE via DB (X-Admin-User-Id obrigatório).
 * O caminho "legado" via header X-Admin-Role foi REMOVIDO (sec-auditor #6):
 * era spoofável trivialmente sem validação.
 */
async function requireSuperAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || token !== VALID_TOKEN) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  const userId = req.headers['x-admin-user-id'];
  if (!userId) {
    return res.status(403).json({ error: 'Sessão admin inválida — refaça login' });
  }
  try {
    const user = await prisma.adminUser.findUnique({ where: { id: String(userId) } });
    if (user && user.active && user.role === 'super_admin') {
      req.adminUser = user;
      return next();
    }
  } catch (e) {
    console.error('[requireSuperAdmin] lookup error', e?.message);
  }
  return res.status(403).json({ error: 'Apenas super admin pode realizar essa ação' });
}

module.exports = { requireAdmin, requireSuperAdmin };
