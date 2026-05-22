/**
 * logError — wrapper sanitizado de console.error.
 *
 * Motivação (pii-auditor): logs com objeto Error completo de handlers
 * que processam senha/CPF/CNPJ/email/cartão acabam vazando PII em
 * produção. Erros Prisma incluem `meta.target` com valores que violaram
 * unique constraint. Erros Clerk incluem `clerkErr.errors[].longMessage`
 * com email/senha tentados. Erros Stripe podem incluir `card.last4`,
 * `billing_details.email/phone`.
 *
 * Uso:
 *   const { logError } = require('../utils/logError');
 *   try { ... } catch (err) { logError('admin login', err); ... }
 *
 * Saída: "[scope] <err.message>" — apenas a mensagem, sem stack/objeto.
 * Se o erro tem `err.code` ou `err.type` (Prisma/Stripe), também
 * inclui — esses são códigos categóricos, não dados.
 */
function logError(scope, err) {
  const msg = err?.message || String(err);
  const code = err?.code || err?.type;
  if (code) {
    console.error(`[${scope}] ${msg} (${code})`);
  } else {
    console.error(`[${scope}] ${msg}`);
  }
}

/**
 * publicErrorMessage — gera mensagem segura para responder ao cliente.
 *
 * Endpoints públicos (whatsapp webhook, imports) não devem devolver
 * `err.message` cru no body — vaza nome de tabela/coluna/valor que
 * disparou constraint do Prisma (CNPJ duplicado, email já em uso, etc).
 *
 * Em dev (NODE_ENV !== 'production') retorna a mensagem real pra
 * facilitar debug; em prod retorna o fallback genérico.
 */
function publicErrorMessage(fallback, err) {
  if (process.env.NODE_ENV === 'production') return fallback;
  return err?.message ? `${fallback} (${err.message})` : fallback;
}

module.exports = { logError, publicErrorMessage };
