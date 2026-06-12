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
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { db } = require('../db/client');
const t = require('../db/schema-bpo');
const { eq } = require('drizzle-orm');
const { getStripe, getClientPlanByPriceId } = require('../services/stripeService');
const { sendWelcomeEmail } = require('../services/emailService');
const { logAudit } = require('../services/auditService');
const { ensureClerkUserForClient, generateTempPassword } = require('../services/clientAuthSetup');

const router = express.Router();

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
    const [c] = await db.select().from(t.client)
      .where(eq(t.client.stripeSubscriptionId, stripeSubscriptionId)).limit(1);
    if (c) return c;
  }
  if (stripeCustomerId) {
    const [c] = await db.select().from(t.client)
      .where(eq(t.client.stripeCustomerId, stripeCustomerId)).limit(1);
    return c || null;
  }
  return null;
}

async function findClientFromCheckoutSession(session) {
  // 1) metadata.clientHash — setado no createClientCheckout (fluxo via app).
  if (session?.metadata?.clientHash) {
    const [c] = await db.select().from(t.client)
      .where(eq(t.client.hash, session.metadata.clientHash)).limit(1);
    if (c) return c;
  }
  // 2) Pelo customer Stripe já vinculado.
  if (session?.customer) {
    const [c] = await db.select().from(t.client)
      .where(eq(t.client.stripeCustomerId, session.customer)).limit(1);
    if (c) return c;
  }
  // 3) Pelo email (último fallback — útil quando cliente paga via Payment
  //    Link externo da LP mas já tem cadastro no Breakr com mesmo email).
  const email = session?.customer_details?.email || session?.customer_email;
  if (email) {
    const [c] = await db.select().from(t.client)
      .where(eq(t.client.email, email.toLowerCase().trim())).limit(1);
    if (c) return c;
  }
  return null;
}

/**
 * autoCreateClientFromCheckout — cria conta Breakr automaticamente quando
 * o pagamento vem de fonte EXTERNA (Payment Link da LP, por exemplo) sem
 * que o cliente tenha cadastrado no app antes.
 *
 * Estratégia (atualizada 29/05/2026):
 *   1. Cria Client com hash CSPRNG, email do checkout, name do checkout
 *      (fallback "Cliente Breakr").
 *   2. Gera senha temporaria (10 hex chars) + bcrypt 10 rounds.
 *   3. Cria user no Clerk com passwordDigest bcrypt (best-effort —
 *      cliente segue funcional via hash magico se Clerk falhar).
 *   4. Linka client.clerkUserId no banco.
 *   5. Marca subscriptionStatus + stripeCustomerId/SubscriptionId.
 *   6. Envia welcome email com credenciais (email + senha temp) E
 *      link ?hash=... — cliente pode logar via Clerk OU via link magico.
 *   7. Loga auditoria 'client.auto_created_from_stripe' com flag
 *      clerkLinked pra rastreio.
 *
 * Retorna o client criado ou null se faltam dados mínimos (sem email).
 */
async function autoCreateClientFromCheckout(session, sub) {
  const email = session?.customer_details?.email || session?.customer_email;
  if (!email) {
    console.warn('[stripe webhook] auto-create: session sem email — abortando', session.id);
    return null;
  }

  const normalizedEmail = email.toLowerCase().trim();
  // Race-condition guard: se outro webhook já criou nesse meio-tempo, reusa.
  const [existing] = await db.select().from(t.client)
    .where(eq(t.client.email, normalizedEmail)).limit(1);
  if (existing) return existing;

  const name = session?.customer_details?.name || 'Cliente Breakr';
  const hash = crypto.randomBytes(16).toString('hex');

  // Senha temporaria — mesma logica do POST /admin/clients pra cliente
  // logar via Clerk imediatamente apos receber welcome email.
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  // Dados iniciais mínimos — replica padrão de POST /admin/clients
  const initialData = {
    restaurant: { name, category: 'Gastronomia' },
    user: { name, role: 'Gerente' },
    operational: { fichas: [], insumos: [] },
  };

  const [client] = await db.insert(t.client).values({
    id: crypto.randomUUID(),
    name,
    hash,
    email: normalizedEmail,
    password: passwordHash,
    data: JSON.stringify(initialData),
    stripeCustomerId: session.customer || null,
    stripeSubscriptionId: session.subscription || null,
    subscriptionStatus: sub ? mapStripeStatus(sub.status) : 'active',
    subscriptionPlan: sub?.items?.data?.[0]?.price?.id || null,
    currentPeriodEnd: tsToDate(sub?.current_period_end),
    trialEndsAt: tsToDate(sub?.trial_end),
    updatedAt: new Date(),
  }).returning();

  // Cria/linka user no Clerk com mesma senha bcrypt — best-effort
  const clerkResult = await ensureClerkUserForClient({
    email: normalizedEmail,
    name,
    passwordHash,
  });
  if (clerkResult.clerkUserId) {
    await db.update(t.client)
      .set({ clerkUserId: clerkResult.clerkUserId, updatedAt: new Date() })
      .where(eq(t.client.id, client.id));
  }

  // Welcome email com credenciais — best-effort, não bloqueia (mas loga)
  sendWelcomeEmail({ to: normalizedEmail, clientName: name, hash, tempPassword })
    .catch(err => console.warn('[stripe webhook] auto-create welcome email falhou:', err.message));

  logAudit({
    action: 'client.auto_created_from_stripe',
    category: 'admin',
    entityType: 'client',
    entityId: client.id,
    actorType: 'system',
    actorId: null,
    actorLabel: 'stripe-webhook',
    summary: `Cliente "${name}" criado automaticamente após pagamento via Stripe`,
    metadata: {
      stripeCustomerId: session.customer,
      stripeSubscriptionId: session.subscription,
      sessionId: session.id,
      email: normalizedEmail,
      source: session?.metadata?.clientHash ? 'app' : 'payment_link',
      clerkLinked: !!clerkResult.clerkUserId,
      clerkError: clerkResult.error,
    },
  });

  console.log(`[stripe webhook] auto-criado Client id=${client.id} email=${normalizedEmail} clerkLinked=${!!clerkResult.clerkUserId}`);
  return client;
}

// ─── Handlers por tipo de evento ─────────────────────────────────────
async function handleCheckoutCompleted(session) {
  if (session.mode !== 'subscription') return null;

  // Busca a subscription pra ter dados completos (status, periodos, plano).
  // Carregamos antes do find/auto-create pra passar pro auto-create se precisar.
  let sub = null;
  if (session.subscription) {
    try { sub = await getStripe().subscriptions.retrieve(session.subscription); }
    catch (err) { console.warn('[stripe webhook] subscriptions.retrieve falhou:', err.message); }
  }

  // 1) Tenta achar cliente existente (metadata.clientHash, stripeCustomerId, ou email)
  let client = await findClientFromCheckoutSession(session);

  // 2) Se não achou, AUTO-CRIA — fluxo Payment Link externo (LP).
  //    Já preenche stripeCustomerId/SubscriptionId/status no insert, então
  //    o update abaixo vira no-op (idempotente).
  if (!client) {
    client = await autoCreateClientFromCheckout(session, sub);
    if (!client) {
      console.warn('[stripe webhook] checkout.session.completed sem client e auto-create falhou', session.id);
      return null;
    }
    return client.id; // já criado com tudo, não precisa update
  }

  // 3) Cliente encontrado — atualiza com dados da assinatura.
  await db.update(t.client)
    .set({
      stripeCustomerId: session.customer || client.stripeCustomerId,
      stripeSubscriptionId: session.subscription || client.stripeSubscriptionId,
      subscriptionStatus: sub ? mapStripeStatus(sub.status) : 'active',
      subscriptionPlan: sub?.items?.data?.[0]?.price?.id || null,
      currentPeriodEnd: tsToDate(sub?.current_period_end),
      trialEndsAt: tsToDate(sub?.trial_end),
      canceledAt: null,
      pastDueSince: null,
      updatedAt: new Date(),
    })
    .where(eq(t.client.id, client.id));
  return client.id;
}

async function handleSubscriptionUpsert(subscription) {
  const client = await findClientByCustomerOrSubscription(subscription.customer, subscription.id);
  if (!client) {
    console.warn('[stripe webhook] subscription upsert sem client', subscription.id);
    return null;
  }
  const status = mapStripeStatus(subscription.status);
  await db.update(t.client)
    .set({
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: status,
      subscriptionPlan: subscription.items?.data?.[0]?.price?.id || null,
      currentPeriodEnd: tsToDate(subscription.current_period_end),
      trialEndsAt: tsToDate(subscription.trial_end),
      pastDueSince: status === 'past_due' ? (client.pastDueSince || new Date()) : null,
      canceledAt: status === 'canceled' ? (client.canceledAt || new Date()) : null,
      updatedAt: new Date(),
    })
    .where(eq(t.client.id, client.id));
  return client.id;
}

async function handleSubscriptionDeleted(subscription) {
  const client = await findClientByCustomerOrSubscription(subscription.customer, subscription.id);
  if (!client) return null;
  await db.update(t.client)
    .set({
      subscriptionStatus: 'canceled',
      canceledAt: new Date(),
      currentPeriodEnd: tsToDate(subscription.current_period_end) || client.currentPeriodEnd,
      updatedAt: new Date(),
    })
    .where(eq(t.client.id, client.id));
  return client.id;
}

async function handleInvoicePaid(invoice) {
  const client = await findClientByCustomerOrSubscription(invoice.customer, invoice.subscription);
  if (!client) return null;
  // currentPeriodEnd quem ajusta é o customer.subscription.updated (Stripe
  // dispara em sequência) — aqui só status/pastDueSince.
  await db.update(t.client)
    .set({
      subscriptionStatus: 'active',
      pastDueSince: null,
      updatedAt: new Date(),
    })
    .where(eq(t.client.id, client.id));
  return client.id;
}

async function handleInvoiceFailed(invoice) {
  const client = await findClientByCustomerOrSubscription(invoice.customer, invoice.subscription);
  if (!client) return null;
  await db.update(t.client)
    .set({
      subscriptionStatus: 'past_due',
      pastDueSince: client.pastDueSince || new Date(),
      updatedAt: new Date(),
    })
    .where(eq(t.client.id, client.id));
  return client.id;
}

async function findClientByCustomerId(customerId) {
  if (!customerId) return null;
  const [c] = await db.select().from(t.client)
    .where(eq(t.client.stripeCustomerId, customerId)).limit(1);
  return c || null;
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
  const [already] = await db.select().from(t.stripeEvent)
    .where(eq(t.stripeEvent.id, event.id)).limit(1).catch(() => []);
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
    await db.insert(t.stripeEvent).values({
      id: event.id,
      type: event.type,
      clientId: affectedClientId,
      payload: JSON.stringify(event).slice(0, 100000), // trunca payloads grandes
    });
  } catch (err) {
    // 23505 = unique_violation no Postgres/pg (race: outro worker já inseriu).
    // Qualquer outro erro só loga.
    if (err && err.code !== '23505') console.error('[stripe webhook] StripeEvent.create:', err.message);
  }

  // 5) Auditoria (best-effort, nunca quebra).
  logAudit({
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
