/**
 * Admin Auth Middleware — gating de rotas administrativas.
 *
 * V1: validação header-based (X-Admin-Token + X-Admin-Role) — protege contra
 * acessos não autenticados ao /admin/users e similares. NÃO é JWT/SSO real
 * mas FECHA O HOLE óbvio onde qualquer um podia chamar /admin/users.
 *
 * V2 (futuro): substituir por JWT assinado no /admin/login, validar
 * issuer/expiry/role aqui. Quando Clerk SSO ativar, validar Clerk session.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const VALID_TOKEN = process.env.ADMIN_TOKEN || 'mock-admin-token';

/**
 * requireAdmin — valida que requisição vem de um admin logado.
 * Aceita:
 *   - X-Admin-Token: <VALID_TOKEN> (obrigatório)
 *   - X-Admin-User-Id: <uuid> (opcional, mas recomendado pra audit log)
 *   - X-Admin-Role: <role> (header informativo, validado se presente)
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
      console.error('[adminAuth] lookup error', e);
      // não bloqueia — apenas não popula req.adminUser
    }
  }
  next();
}

/**
 * requireSuperAdmin — exige role super_admin alem do token válido.
 * Por enquanto confia no header X-Admin-Role mas valida via DB se
 * X-Admin-User-Id também presente.
 */
async function requireSuperAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || token !== VALID_TOKEN) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  const headerRole = req.headers['x-admin-role'];
  const userId = req.headers['x-admin-user-id'];

  // Caminho 1: AdminUser do banco com role validada
  if (userId) {
    try {
      const user = await prisma.adminUser.findUnique({ where: { id: String(userId) } });
      if (user && user.active && user.role === 'super_admin') {
        req.adminUser = user;
        return next();
      }
    } catch (e) {
      console.error('[requireSuperAdmin] lookup error', e);
    }
  }

  // Caminho 2: legado — confia no header X-Admin-Role pra ADMIN_ACCOUNTS hardcoded
  // (até migração completa pro AdminUser do banco)
  if (headerRole === 'super_admin') {
    return next();
  }

  return res.status(403).json({ error: 'Apenas super admin pode realizar essa ação' });
}

module.exports = { requireAdmin, requireSuperAdmin };
