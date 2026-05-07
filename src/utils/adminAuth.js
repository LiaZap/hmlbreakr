/**
 * Admin Auth helpers — front-end side do header-based auth do backend.
 *
 * V1: depois do POST /admin/login, guardamos token + adminUserId + role
 * em sessionStorage. Cada chamada subsequente injeta os headers:
 *   - X-Admin-Token  (validação primária)
 *   - X-Admin-User-Id (pra audit + role do banco)
 *   - X-Admin-Role  (legado/UX, validado se presente)
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
  const token = sessionStorage.getItem(TOKEN_KEY) || 'mock-admin-token';
  const adminUserId = sessionStorage.getItem(USER_ID_KEY);
  const role = sessionStorage.getItem(ROLE_KEY);
  const headers = { 'X-Admin-Token': token };
  if (adminUserId) headers['X-Admin-User-Id'] = adminUserId;
  if (role) headers['X-Admin-Role'] = role;
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
