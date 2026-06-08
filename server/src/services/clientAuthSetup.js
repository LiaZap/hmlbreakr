/**
 * clientAuthSetup — helpers compartilhados pra setup de autenticacao
 * de um novo cliente (Clerk + senha temporaria).
 *
 * Reusado por:
 *   - POST /admin/clients (criacao manual via painel admin)
 *   - stripeWebhook autoCreateClientFromCheckout (criacao apos checkout Stripe)
 *
 * Mantem a logica de criar/linkar Clerk user + gerar senha temp em um
 * unico lugar pra evitar divergencia entre os dois fluxos.
 */
const crypto = require('crypto');

// Clerk backend client (lazy) — instancia uma unica vez por processo.
let _clerkClient = null;
function getClerk() {
  if (_clerkClient) return _clerkClient;
  if (!process.env.CLERK_SECRET_KEY) return null;
  const { createClerkClient } = require('@clerk/backend');
  _clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  return _clerkClient;
}

/**
 * Cria (ou re-aproveita) um user no Clerk pra um cliente recem criado.
 * - Idempotente: se ja existe Clerk user com esse email, retorna ele
 * - Usa passwordDigest bcrypt pra preservar a senha (Clerk aceita nativamente)
 * - Best-effort: erros sao logados mas NAO bloqueiam a criacao do cliente
 *   (o welcome email com hash magico continua funcionando como fallback)
 *
 * @param {object} args
 * @param {string} args.email
 * @param {string} args.name
 * @param {string} args.passwordHash — bcrypt hash (Clerk aceita via passwordDigest)
 * @returns {Promise<{ clerkUserId: string|null, error: string|null }>}
 */
async function ensureClerkUserForClient({ email, name, passwordHash }) {
  const clerk = getClerk();
  if (!clerk) {
    return { clerkUserId: null, error: 'CLERK_SECRET_KEY ausente' };
  }
  try {
    const list = await clerk.users.getUserList({ emailAddress: [email] });
    if (list.totalCount > 0) {
      return { clerkUserId: list.data[0].id, error: null };
    }
    const [firstName, ...rest] = (name || 'Cliente').split(' ');
    const user = await clerk.users.createUser({
      emailAddress: [email],
      firstName: firstName || 'Cliente',
      lastName: rest.join(' ') || 'Breakr',
      passwordDigest: passwordHash,
      passwordHasher: 'bcrypt',
      skipPasswordChecks: true,
    });
    return { clerkUserId: user.id, error: null };
  } catch (err) {
    const detail = err?.errors ? JSON.stringify(err.errors) : err.message;
    console.warn('[clerk] criar user falhou (cliente segue funcional via hash):', detail);
    return { clerkUserId: null, error: detail };
  }
}

/**
 * Gera senha temporaria amigavel pra cliente novo. 10 chars, hex
 * (40 bits de entropia — adequado pra senha de primeiro acesso que
 * o cliente deve trocar). Visualmente: "a3f7b9d2c4".
 */
function generateTempPassword() {
  return crypto.randomBytes(5).toString('hex');
}

module.exports = {
  getClerk,
  ensureClerkUserForClient,
  generateTempPassword,
};
