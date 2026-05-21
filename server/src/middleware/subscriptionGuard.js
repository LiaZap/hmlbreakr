/**
 * Subscription Guard — F3 do projeto Stripe.
 *
 * Decide se um cliente pode acessar/escrever no sistema com base no
 * `Client.subscriptionStatus` + flags de bloqueio manual. Usado em:
 *  - /client/:hash/sync e /sync-partial (mutações do dashboard)
 *  - Todas as rotas BPO (via requireBpoClient — middleware.js do bpo)
 *
 * Compatibilidade com base legada: clientes SEM subscriptionStatus
 * (todos os existentes pré-Stripe) são tratados como ALLOWED — não
 * bloqueamos quem nunca passou pelo fluxo de cobrança. Só clientes
 * que efetivamente entraram no Stripe têm o status enforced.
 */

/**
 * Computa o veredicto de acesso a partir do snapshot do Client.
 * Não escreve nada — pura função.
 *
 * @param {object} client — registro Prisma do Client.
 * @returns {{allowed: boolean, statusCode?: number, reason?: string, message?: string}}
 */
function computeSubscriptionVerdict(client) {
  if (!client) return { allowed: true }; // sem cliente, deixa o handler responder 404.

  // 1) Bloqueio manual pelo admin sobrepõe tudo.
  if (client.blockedByAdmin) {
    return {
      allowed: false,
      statusCode: 403,
      reason: 'admin_blocked',
      message: client.blockedReason || 'Conta bloqueada pelo administrador.',
    };
  }

  // 2) Legacy: cliente sem status (pré-Stripe) → liberado.
  if (!client.subscriptionStatus) return { allowed: true };

  const now = new Date();
  switch (client.subscriptionStatus) {
    case 'trial':
    case 'active':
    case 'past_due': // período de graça — libera acesso, frontend mostra aviso
      return { allowed: true };

    case 'canceled': {
      // Cliente cancelou mas ainda está dentro do período pago.
      if (client.currentPeriodEnd && new Date(client.currentPeriodEnd) > now) {
        return { allowed: true };
      }
      return {
        allowed: false,
        statusCode: 402,
        reason: 'expired',
        message: 'Sua assinatura expirou. Reative para continuar usando o sistema.',
      };
    }

    case 'unpaid':
      return {
        allowed: false,
        statusCode: 402,
        reason: 'unpaid',
        message: 'Pagamento pendente. Atualize seu método de pagamento para reativar o acesso.',
      };

    default:
      // Status desconhecido (futuro Stripe) — fail-open (não bloqueia por
      // algo que não conhecemos; melhor permitir uso do que travar errado).
      return { allowed: true };
  }
}

/**
 * Constrói o objeto `subscription` enriquecido que o frontend usa pra
 * decidir modais e telas de bloqueio. Acoplado ao verdict acima.
 */
function buildSubscriptionInfo(client) {
  if (!client) return null;
  const verdict = computeSubscriptionVerdict(client);
  const now = Date.now();
  const trial = client.trialEndsAt ? new Date(client.trialEndsAt).getTime() : null;
  const charge = client.currentPeriodEnd ? new Date(client.currentPeriodEnd).getTime() : null;
  return {
    status: client.subscriptionStatus || null,
    plan: client.subscriptionPlan || null,
    trialEndsAt: client.trialEndsAt || null,
    currentPeriodEnd: client.currentPeriodEnd || null,
    pastDueSince: client.pastDueSince || null,
    canceledAt: client.canceledAt || null,
    blockedByAdmin: !!client.blockedByAdmin,
    blockedReason: client.blockedReason || null,
    blocked: !verdict.allowed,
    blockReason: verdict.allowed ? null : verdict.reason,
    blockMessage: verdict.allowed ? null : verdict.message,
    // Dias úteis pra UI decidir modal — clamps em 0 (nunca negativo no display).
    daysToTrialEnd: trial != null ? Math.max(0, Math.ceil((trial - now) / 86400000)) : null,
    daysToCharge: charge != null ? Math.max(0, Math.ceil((charge - now) / 86400000)) : null,
  };
}

/**
 * Helper inline para usar em route handlers que já carregaram o Client.
 * Se bloqueado, escreve a resposta e retorna `true`.
 * Senão, retorna `false` (rota continua).
 *
 * Uso:
 *   if (blockIfNotAllowed(client, res)) return;
 */
function blockIfNotAllowed(client, res) {
  const verdict = computeSubscriptionVerdict(client);
  if (verdict.allowed) return false;
  res.status(verdict.statusCode).json({
    blocked: true,
    reason: verdict.reason,
    message: verdict.message,
    subscriptionStatus: client.subscriptionStatus || null,
  });
  return true;
}

module.exports = {
  computeSubscriptionVerdict,
  buildSubscriptionInfo,
  blockIfNotAllowed,
};
