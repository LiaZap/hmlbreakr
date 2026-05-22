/**
 * Stripe Webhook — F2 do projeto Stripe.
 *
 * Endpoint: POST /api/stripe/webhook (público, sem auth).
 * Segurança:
 *  - Valida `stripe-signature` com STRIPE_WEBHOOK_SECRET (sem isso, qualquer
 *    um pode forjar eventos e mexer no estado das assinaturas).
 *  - Idempotente: deduplica por `event.id` via tabela StripeEvent.
 *  - SEMPRE responde 200 após processar (mesmo em erro interno), pra Stripe
 *    não entrar em loop de retentativa — quem precisa investigar olha o
 *    AuditLog / console.
 *
 * IMPORTANTE: este router consome o body como RAW (express.raw) — precisa
 * estar montado ANTES de `express.json()` no app, pra o body não chegar
 * já parseado (signature verifica o byte-a-byte).
 *
 * Eventos tratados (plano F2):
 *   checkout.session.completed              — assinatura nova, linka customer/sub
 *   customer.subscription.created/updated   — sincroniza status + currentPeriodEnd
 *   customer.subscription.deleted           — cancelado, marca canceledAt
 *   customer.subscription.trial_will_end    — informativo (modal dispara via trialEndsAt)
 *   invoice.payment_succeeded               — status = active, limpa pastDueSince
 *   invoice.payment_failed                  — status = past_due, marca pastDueSince
 *   customer.source.expiring                — cartão prestes a expirar (TODO email F3)
 *   charge.dispute.created                  — chargeback (auditoria categoria security)
 *   charge.refunded                         — refund processado
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { getStripe } = require('../services/stripeService');
const { logAudit } = require('../services/auditService');

const router = express.Router();
const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────
const tsToDate = (unixSec) => (unixSec ? new Date(unixSec * 1000) : null);

// Mapeia Stripe status (subscription.status) para o nosso enum interno.
function mapStripeStatus(stripeStatus) {
  switch (stripeStatus) {
    case 'trialing': return 'trial';
    case 'active': return 'active';
    case 'past_due': return 'past_due';
    case 'unpaid': return 'unpaid';
    case 'canceled': return 'canceled';
    case 'incomplete':
    case 'incomplete_expired':
      return 'unpaid';
    default: return stripeStatus;
  }
}

async function findClientByCustomerOrSubscription(stripeCustomerId, stripeSubscriptionId) {
  if (stripeSubscriptionId) {
    const c = await prisma.client.findFirst({ where: { stripeSubscriptionId } });
    if (c) return c;
  }
  if (stripeCustomerId) {
    return prisma.client.findFirst({ where: { stripeCustomerId } });
  }
  return null;
}

async function findClientFromCheckoutSession(session) {
  // 1) metadata.clientHash — setado no createClientCheckout.
  if (session?.metadata?.clientHash) {
    const c = await prisma.client.findUnique({ where: { hash: session.metadata.clientHash } });
    if (c) return c;
  }
  // 2) Pelo customer já criado.
  if (session?.customer) {
    return prisma.client.findFirst({ where: { stripeCustomerId: session.customer } });
  }
  return null;
}

// ─── Handlers por tipo de evento ─────────────────────────────────────
async function handleCheckoutCompleted(session) {
  if (session.mode !== 'subscription') return null;
  const client = await findClientFromCheckoutSession(session);
  if (!client) {
    console.warn('[stripe webhook] checkout.session.completed sem client correspondente', session.id);
    return null;
  }
  // Busca a subscription pra ter dados completos (status, periodos, plano).
  let sub = null;
  if (session.subscription) {
    try { sub = await getStripe().subscriptions.retrieve(session.subscription); }
    catch (err) { console.warn('[stripe webhook] subscriptions.retrieve falhou:', err.message); }
  }
  await prisma.client.update({
    where: { id: client.id },
    data: {
      stripeCustomerId: session.customer || client.stripeCustomerId,
      stripeSubscriptionId: session.subscription || client.stripeSubscriptionId,
      subscriptionStatus: sub ? mapStripeStatus(sub.status) : 'active',
      subscriptionPlan: sub?.items?.data?.[0]?.price?.id || null,
      currentPeriodEnd: tsToDate(sub?.current_period_end),
      trialEndsAt: tsToDate(sub?.trial_end),
      canceledAt: null,
      pastDueSince: null,
    },
  });
  return client.id;
}

async function handleSubscriptionUpsert(subscription) {
  const client = await findClientByCustomerOrSubscription(subscription.customer, subscription.id);
  if (!client) {
    console.warn('[stripe webhook] subscription upsert sem client', subscription.id);
    return null;
  }
  const status = mapStripeStatus(subscription.status);
  await prisma.client.update({
    where: { id: client.id },
    data: {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: status,
      subscriptionPlan: subscription.items?.data?.[0]?.price?.id || null,
      currentPeriodEnd: tsToDate(subscription.current_period_end),
      trialEndsAt: tsToDate(subscription.trial_end),
      pastDueSince: status === 'past_due' ? (client.pastDueSince || new Date()) : null,
      canceledAt: status === 'canceled' ? (client.canceledAt || new Date()) : null,
    },
  });
  return client.id;
}

async function handleSubscriptionDeleted(subscription) {
  const client = await findClientByCustomerOrSubscription(subscription.customer, subscription.id);
  if (!client) return null;
  await prisma.client.update({
    where: { id: client.id },
    data: {
      subscriptionStatus: 'canceled',
      canceledAt: new Date(),
      currentPeriodEnd: tsToDate(subscription.current_period_end) || client.currentPeriodEnd,
    },
  });
  return client.id;
}

async function handleInvoicePaid(invoice) {
  const client = await findClientByCustomerOrSubscription(invoice.customer, invoice.subscription);
  if (!client) return null;
  // currentPeriodEnd quem ajusta é o customer.subscription.updated (Stripe
  // dispara em sequência) — aqui só status/pastDueSince.
  await prisma.client.update({
    where: { id: client.id },
    data: {
      subscriptionStatus: 'active',
      pastDueSince: null,
    },
  });
  return client.id;
}

async function handleInvoiceFailed(invoice) {
  const client = await findClientByCustomerOrSubscription(invoice.customer, invoice.subscription);
  if (!client) return null;
  await prisma.client.update({
    where: { id: client.id },
    data: {
      subscriptionStatus: 'past_due',
      pastDueSince: client.pastDueSince || new Date(),
    },
  });
  return client.id;
}

async function findClientByCustomerId(customerId) {
  if (!customerId) return null;
  return prisma.client.findFirst({ where: { stripeCustomerId: customerId } });
}

// ─── Webhook endpoint ────────────────────────────────────────────────
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  let stripe;
  try { stripe = getStripe(); }
  catch (err) {
    console.error('[stripe webhook]', err.message);
    return res.status(503).json({ error: 'Stripe não configurado' });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe webhook] STRIPE_WEBHOOK_SECRET não configurado');
    return res.status(503).json({ error: 'Webhook secret não configurado' });
  }

  // 1) Signature check — sem isto, qualquer um forja eventos.
  let event;
  try {
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.warn('[stripe webhook] signature inválida:', err.message);
    return res.status(400).json({ error: 'signature inválida' });
  }

  // 2) Idempotência — Stripe pode reenviar o mesmo event.id.
  const already = await prisma.stripeEvent.findUnique({ where: { id: event.id } }).catch(() => null);
  if (already) {
    return res.json({ received: true, deduped: true });
  }

  // 3) Dispatch.
  let affectedClientId = null;
  let auditCategory = 'data';
  let handled = true;

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        affectedClientId = await handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        affectedClientId = await handleSubscriptionUpsert(event.data.object);
        break;

      case 'customer.subscription.deleted':
        auditCategory = 'security';
        affectedClientId = await handleSubscriptionDeleted(event.data.object);
        break;

      case 'customer.subscription.trial_will_end':
        affectedClientId = (await findClientByCustomerOrSubscription(
          event.data.object.customer, event.data.object.id
        ))?.id || null;
        break;

      case 'invoice.payment_succeeded':
        affectedClientId = await handleInvoicePaid(event.data.object);
        break;

      case 'invoice.payment_failed':
        affectedClientId = await handleInvoiceFailed(event.data.object);
        break;

      case 'customer.source.expiring':
        // TODO F3: gatilho de email "cartão prestes a expirar".
        affectedClientId = (await findClientByCustomerId(event.data.object.customer))?.id || null;
        break;

      case 'charge.dispute.created':
        auditCategory = 'security';
        affectedClientId = (await findClientByCustomerId(event.data.object.customer))?.id || null;
        break;

      case 'charge.refunded':
        affectedClientId = (await findClientByCustomerId(event.data.object.customer))?.id || null;
        break;

      default:
        // Stripe envia dezenas de tipos; só logamos os que nos interessam.
        handled = false;
        break;
    }
  } catch (err) {
    // NÃO retorna 5xx — Stripe entraria em loop de retentativa. Marcamos
    // como processado no StripeEvent pra não loopar, e logamos no audit.
    // PII-safe: somente message + code/type (não o objeto cru com card.last4
    // ou billing_details.email/phone) — pii-auditor #6.
    console.error(`[stripe webhook] handler error: ${err?.message || err} (event=${event.type}/${event.id}, type=${err?.type || 'unknown'})`);
  }

  // 4) Marca o evento como processado (dedup futuro).
  try {
    await prisma.stripeEvent.create({
      data: {
        id: event.id,
        type: event.type,
        clientId: affectedClientId,
        payload: JSON.stringify(event).slice(0, 100000), // trunca payloads grandes
      },
    });
  } catch (err) {
    // P2002 = race (outro worker já inseriu). Qualquer outro erro só loga.
    if (err && err.code !== 'P2002') console.error('[stripe webhook] StripeEvent.create:', err.message);
  }

  // 5) Auditoria (best-effort, nunca quebra).
  logAudit(prisma, {
    action: handled ? `stripe.${event.type}` : 'stripe.event.ignored',
    category: auditCategory,
    entityType: 'client',
    entityId: affectedClientId,
    actorType: 'system',
    actorId: null,
    actorLabel: 'stripe-webhook',
    summary: `Stripe webhook: ${event.type}`,
    metadata: { stripeEventId: event.id, type: event.type },
  });

  // 6) Sempre 200 — já estamos idempotentes; Stripe não precisa retentar.
  res.json({ received: true });
});

module.exports = router;
