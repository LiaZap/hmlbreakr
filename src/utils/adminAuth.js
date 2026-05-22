/**
 * Admin Auth helpers — front-end side do header-based auth do backend.
 *
 * V1: depois do POST /admin/login, guardamos token + adminUserId + role
 * em sessionStorage. Cada chamada subsequente injeta os headers:
 *   - X-Admin-Token  (validação primária, secret do .env)
 *   - X-Admin-User-Id (obrigatório p/ requireSuperAdmin no backend)
 *
 * NOTE: X-Admin-Role NÃO é mais enviado — backend ignora (era spoofável).
 * A role real vem do AdminUser do banco (lookup via X-Admin-User-Id).
 *
 * V2 (futuro): substituir por JWT no Authorization header. A API permanece
 * tolerante aos headers atuais durante a migração.
 */

const TOKEN_KEY = 'breaker-admin-token';
const USER_ID_KEY = 'breaker-admin-user-id';
const ROLE_KEY = 'breaker-admin-role';
const NAME_KEY = 'breaker-admin-name';

export const setAdminSession = ({ token, adminUserId, role, name } = {}) => {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  if (adminUserId) sessionStorage.setItem(USER_ID_KEY, adminUserId);
  if (role) sessionStorage.setItem(ROLE_KEY, role);
  if (name) sessionStorage.setItem(NAME_KEY, name);
};

export const clearAdminSession = () => {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_ID_KEY);
  sessionStorage.removeItem(ROLE_KEY);
  sessionStorage.removeItem(NAME_KEY);
  sessionStorage.removeItem('breaker-admin');
};

export const getAdminAuthHeaders = () => {
  // Sem fallback: se não há sessão admin, mandamos string vazia e o
  // backend retorna 401. Antes havia um 'mock-admin-token' literal que
  // mascarava bugs de UX (chamada admin sem login passava em dev).
  const token = sessionStorage.getItem(TOKEN_KEY) || '';
  const adminUserId = sessionStorage.getItem(USER_ID_KEY);
  const headers = { 'X-Admin-Token': token };
  if (adminUserId) headers['X-Admin-User-Id'] = adminUserId;
  // X-Admin-Role propositalmente NÃO enviado — backend usa lookup via DB
  return headers;
};

/**
 * adminFetch — wrapper de fetch que injeta headers admin automaticamente.
 * Aceita os mesmos argumentos do fetch padrão.
 */
export const adminFetch = (url, opts = {}) => {
  const headers = {
    ...getAdminAuthHeaders(),
    ...(opts.headers || {}),
  };
  // Adiciona Content-Type só quando há body JSON e não foi setado manualmente
  if (opts.body && !headers['Content-Type'] && typeof opts.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, { ...opts, headers });
};
