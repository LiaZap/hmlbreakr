/**
 * auditMiddleware — captura AUTOMÁTICA de toda mutação do sistema.
 *
 * Montado uma vez em `/api` (index.js), registra na trilha de auditoria
 * (AuditLog) toda requisição que ALTERA dados — POST / PUT / PATCH /
 * DELETE — em qualquer rota: admin, cliente, BPO financeiro, etc.
 *
 * COMPLEMENTA os `logAudit` manuais: endpoints críticos (sync de dados,
 * login, CRUD de admin, restore de snapshot) já gravam logs RICOS com
 * metadados próprios — esses são pulados aqui (dedup via `isManuallyAudited`)
 * para não duplicar. Todo o RESTO do sistema é coberto por este middleware.
 *
 * SEGURANÇA: cada evento recebe uma `category`. Ações sensíveis — login,
 * gestão de admins, exclusões (DELETE), snapshots, acessos negados
 * (401/403) — são marcadas como `security` para destaque na tela.
 *
 * É best-effort: o log roda em `res.on('finish')`, nunca bloqueia nem
 * quebra a resposta ao usuário.
 */

const { PrismaClient } = require('@prisma/client');
const { logAudit } = require('../services/auditService');

const prisma = new PrismaClient();

// Métodos que alteram estado — só esses são auditados.
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Método HTTP → verbo de ação e rótulo legível.
const VERB = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };
const VERB_LABEL = { create: 'Criação', update: 'Atualização', delete: 'Exclusão' };

/**
 * Endpoints que já têm `logAudit` manual (log rico) — pulados aqui para
 * não gerar entrada duplicada. `path` é relativo ao mount `/api`.
 */
function isManuallyAudited(method, path) {
  if (path === '/admin/login') return true;
  if (method === 'POST' && path === '/admin/clients') return true;
  if (method === 'DELETE' && /^\/admin\/clients\/[^/]+$/.test(path)) return true;
  if (/^\/client\/[^/]+\/sync(-partial)?$/.test(path)) return true;
  if (path.startsWith('/admin/users')) return true;
  if (/\/snapshots\/[^/]+\/restore$/.test(path)) return true;
  return false;
}

// Heurística: o segmento parece um id, e não um nome de recurso?
// Nomes de recurso da API são sempre palavras minúsculas (com hífen),
// SEM dígitos — ex: 'payment-methods', 'receivable-advances'. Logo,
// qualquer segmento com dígito, ou muito longo, é tratado como id/hash.
const looksLikeId = (s) => /\d/.test(s) || s.length >= 20;

/**
 * Deriva action + entityType a partir do método e do caminho.
 * Ex: DELETE /bpo/suppliers/abc → { action: 'supplier.delete', entityType: 'supplier' }
 */
function describeRequest(method, path) {
  const segs = path.split('/').filter(Boolean);
  const resourceSegs = segs.filter((s) => !looksLikeId(s));
  let resource = resourceSegs[resourceSegs.length - 1] || 'request';
  // singulariza de forma simples (payables → payable)
  const singular = resource.endsWith('s') ? resource.slice(0, -1) : resource;
  const verb = VERB[method] || method.toLowerCase();
  return { action: `${singular}.${verb}`, entityType: singular };
}

/**
 * Classifica o evento. Ações sensíveis viram `security`.
 */
function categorize(method, path, status) {
  if (status === 401 || status === 403) return 'security'; // acesso negado
  if (path.startsWith('/admin/login')) return 'security';
  if (path.startsWith('/admin/users')) return 'security';
  if (path.includes('/snapshot')) return 'security';
  if (path.includes('/backup')) return 'security';
  if (method === 'DELETE') return 'security'; // exclusões são sensíveis
  if (path.startsWith('/bpo/') || path.includes('/bpo')) return 'bpo';
  if (path.startsWith('/client/')) return 'data';
  if (path.startsWith('/admin')) return 'admin';
  return 'system';
}

/**
 * Resolve quem disparou a requisição a partir do que os middlewares de
 * auth já anexaram ao req (req.adminUser, req.clientId) ou do `path`.
 * `path` é passado capturado de forma síncrona — não usar req.path aqui,
 * pois no `res.on('finish')` o Express pode já ter restaurado a URL.
 */
function resolveActor(req, path) {
  if (req.adminUser) {
    return {
      actorType: 'admin',
      actorId: req.adminUser.id || null,
      actorLabel: req.adminUser.email || req.adminUser.name || null,
    };
  }
  const m = path.match(/^\/client\/([^/]+)/);
  if (m) return { actorType: 'client', actorId: null, actorLabel: m[1] };
  if (req.clientId) {
    return { actorType: 'client', actorId: String(req.clientId), actorLabel: String(req.clientId) };
  }
  return { actorType: 'system', actorId: null, actorLabel: null };
}

/**
 * Cria o middleware de auditoria. Uso: app.use('/api', createAuditMiddleware())
 */
function createAuditMiddleware() {
  return function auditMiddleware(req, res, next) {
    // Só audita mutações; leituras (GET/HEAD/OPTIONS) são ignoradas.
    if (!MUTATING.has(req.method)) return next();

    // `req.path` aqui é relativo ao mount `/api`.
    const method = req.method;
    const path = req.path;

    // Endpoints já cobertos por logAudit manual (log rico) — pula.
    if (isManuallyAudited(method, path)) return next();

    // Registra o log só quando a resposta termina (não bloqueia nada).
    res.on('finish', () => {
      try {
        const status = res.statusCode;
        // 404 (rota inexistente) e 304 não representam ação real.
        if (status === 404 || status === 304) return;

        const { action, entityType } = describeRequest(method, path);
        const category = categorize(method, path, status);
        const actor = resolveActor(req, path);
        const verb = VERB[method] || method.toLowerCase();
        const failed = status >= 400;

        let summary = `${VERB_LABEL[verb] || method} em ${entityType}`;
        if (failed) summary += ` — falhou (${status})`;

        logAudit(prisma, {
          action: failed ? `${action}.failed` : action,
          category,
          entityType,
          entityId: null,
          actorType: actor.actorType,
          actorId: actor.actorId,
          actorLabel: actor.actorLabel,
          summary,
          metadata: { method, path, status },
        });
      } catch (err) {
        // Best-effort: auditoria nunca pode quebrar a aplicação.
        console.error('[auditMiddleware] falha ao registrar:', err?.message || err);
      }
    });

    next();
  };
}

module.exports = { createAuditMiddleware };
