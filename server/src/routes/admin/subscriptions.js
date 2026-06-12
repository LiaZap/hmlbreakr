/**
 * Admin — Assinaturas (Stripe F4).
 *
 * Endpoints (montados sob /api/admin/subscriptions, exige super_admin):
 *   GET  /                          — lista de clientes com status + KPIs
 *   GET  /:clientId                 — detalhe + ultimos StripeEvents do cliente
 *   POST /:clientId/block           — bloqueio manual { reason } (obrigatório)
 *   POST /:clientId/unblock
 *   POST /:clientId/billing-portal  — gera URL do Stripe Portal pro cliente
 *   POST /:clientId/cancel          — cancela assinatura no fim do período
 *
 * Toda ação destrutiva (block/unblock/cancel) vai pra Auditoria categoria 'security'.
 */

const express = require('express');
const crypto = require('crypto');
const { db } = require('../../db/client');
const t = require('../../db/schema-bpo');
const {
  eq, and, or, ne, gt, gte, lt, lte, inArray, notInArray,
  isNull, isNotNull, desc, asc, sql, count,
} = require('drizzle-orm');
const { logAudit } = require('../../services/auditService');
const { createPortalSession, getStripe } = require('../../services/stripeService');

const router = express.Router();

// Shim p/ o auditService (que espera um client com `.auditLog.create({ data })`).
// O AuditLog não tem default de id no banco — o app gera o uuid (como o Prisma fazia).
const auditClient = {
  auditLog: {
    create: async ({ data }) =>
      db.insert(t.auditLog).values({ id: crypto.randomUUID(), ...data }),
  },
};

// ─── GET / — lista + KPIs ──────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, q } = req.query;
    const conds = [eq(t.client.active, true)];
    if (status) conds.push(eq(t.client.subscriptionStatus, status));
    if (q) {
      conds.push(or(
        sql`${t.client.name} ILIKE ${'%' + q + '%'}`,
        sql`${t.client.email} ILIKE ${'%' + q + '%'}`,
      ));
    }
    const items = await db.select({
      id: t.client.id, name: t.client.name, hash: t.client.hash, email: t.client.email,
      subscriptionStatus: t.client.subscriptionStatus, subscriptionPlan: t.client.subscriptionPlan,
      trialEndsAt: t.client.trialEndsAt, currentPeriodEnd: t.client.currentPeriodEnd,
      pastDueSince: t.client.pastDueSince, canceledAt: t.client.canceledAt,
      blockedByAdmin: t.client.blockedByAdmin, blockedAt: t.client.blockedAt,
      blockedReason: t.client.blockedReason,
      stripeCustomerId: t.client.stripeCustomerId, stripeSubscriptionId: t.client.stripeSubscriptionId,
      createdAt: t.client.createdAt,
    })
      .from(t.client)
      .where(and(...conds))
      .orderBy(asc(t.client.subscriptionStatus), asc(t.client.name));
    // KPIs sobre toda a base ativa (independente do filtro)
    const all = await db.select({
      subscriptionStatus: t.client.subscriptionStatus,
      blockedByAdmin: t.client.blockedByAdmin,
    })
      .from(t.client)
      .where(eq(t.client.active, true));
    const kpis = {
      total: all.length,
      active: 0,
      trial: 0,
      past_due: 0,
      unpaid: 0,
      canceled: 0,
      legacy: 0,
      blocked: 0,
    };
    for (const c of all) {
      if (c.blockedByAdmin) kpis.blocked++;
      const s = c.subscriptionStatus;
      if (!s) kpis.legacy++;
      else if (kpis[s] != null) kpis[s]++;
    }
    res.json({ kpis, items });
  } catch (err) {
    console.error('[admin/subscriptions list]', err);
    res.status(500).json({ error: 'Erro ao listar assinaturas' });
  }
});

// ─── GET /:clientId — detalhe + eventos ────────────────────────────
router.get('/:clientId', async (req, res) => {
  try {
    const [client] = await db.select().from(t.client)
      .where(eq(t.client.id, req.params.clientId)).limit(1);
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });
    const events = await db.select({
      id: t.stripeEvent.id, type: t.stripeEvent.type, processedAt: t.stripeEvent.processedAt,
    })
      .from(t.stripeEvent)
      .where(eq(t.stripeEvent.clientId, client.id))
      .orderBy(desc(t.stripeEvent.processedAt))
      .limit(50);
    // Strip o Client.data (grande) — não precisa nessa tela.
    const { data: _omit, password: _p, ...lite } = client;
    res.json({ client: lite, events });
  } catch (err) {
    console.error('[admin/subscriptions detail]', err);
    res.status(500).json({ error: 'Erro ao buscar assinatura' });
  }
});

// ─── POST /:clientId/block ─────────────────────────────────────────
router.post('/:clientId/block', async (req, res) => {
  try {
    const { reason } = req.body || {};
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: 'Motivo do bloqueio é obrigatório.' });
    }
    const [existing] = await db.select().from(t.client)
      .where(eq(t.client.id, req.params.clientId)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });
    const [item] = await db.update(t.client)
      .set({
        blockedByAdmin: true,
        blockedAt: new Date(),
        blockedReason: String(reason).trim(),
        blockedByUserId: req.adminUser ? req.adminUser.id : null,
        updatedAt: new Date(),
      })
      .where(eq(t.client.id, req.params.clientId))
      .returning({
        id: t.client.id, name: t.client.name, blockedByAdmin: t.client.blockedByAdmin,
        blockedAt: t.client.blockedAt, blockedReason: t.client.blockedReason,
      });
    logAudit(auditClient, {
      action: 'client.block',
      category: 'security',
      entityType: 'client',
      entityId: existing.id,
      actorType: 'admin',
      actorId: req.adminUser ? req.adminUser.id : null,
      actorLabel: req.adminUser ? req.adminUser.email : null,
      summary: `Bloqueou manualmente o cliente "${existing.name}"`,
      metadata: { reason: String(reason).trim() },
    });
    res.json({ success: true, client: item });
  } catch (err) {
    console.error('[admin/subscriptions block]', err);
    res.status(500).json({ error: 'Erro ao bloquear cliente' });
  }
});

// ─── POST /:clientId/unblock ───────────────────────────────────────
router.post('/:clientId/unblock', async (req, res) => {
  try {
    const [existing] = await db.select().from(t.client)
      .where(eq(t.client.id, req.params.clientId)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });
    const [item] = await db.update(t.client)
      .set({
        blockedByAdmin: false,
        blockedAt: null,
        blockedReason: null,
        blockedByUserId: null,
        updatedAt: new Date(),
      })
      .where(eq(t.client.id, req.params.clientId))
      .returning({
        id: t.client.id, name: t.client.name, blockedByAdmin: t.client.blockedByAdmin,
      });
    logAudit(auditClient, {
      action: 'client.unblock',
      category: 'security',
      entityType: 'client',
      entityId: existing.id,
      actorType: 'admin',
      actorId: req.adminUser ? req.adminUser.id : null,
      actorLabel: req.adminUser ? req.adminUser.email : null,
      summary: `Desbloqueou o cliente "${existing.name}"`,
    });
    res.json({ success: true, client: item });
  } catch (err) {
    console.error('[admin/subscriptions unblock]', err);
    res.status(500).json({ error: 'Erro ao desbloquear cliente' });
  }
});

// ─── POST /:clientId/billing-portal ────────────────────────────────
router.post('/:clientId/billing-portal', async (req, res) => {
  try {
    const [c] = await db.select().from(t.client)
      .where(eq(t.client.id, req.params.clientId)).limit(1);
    if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
    if (!c.stripeCustomerId) {
      return res.status(400).json({ error: 'Cliente ainda não tem Customer no Stripe.' });
    }
    const returnUrl = req.body?.returnUrl || process.env.APP_URL || 'https://app.breakr.com.br';
    const session = await createPortalSession({ stripeCustomerId: c.stripeCustomerId, returnUrl });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[admin/subscriptions portal]', err);
    res.status(500).json({ error: 'Erro ao abrir portal' });
  }
});

// ─── POST /:clientId/cancel — cancela no fim do período ────────────
router.post('/:clientId/cancel', async (req, res) => {
  try {
    const [c] = await db.select().from(t.client)
      .where(eq(t.client.id, req.params.clientId)).limit(1);
    if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
    if (!c.stripeSubscriptionId) {
      return res.status(400).json({ error: 'Cliente não tem assinatura ativa no Stripe.' });
    }
    const stripe = getStripe();
    // cancel_at_period_end: preserva acesso até o fim do período pago.
    // Stripe vai disparar customer.subscription.updated → webhook sincroniza.
    const updated = await stripe.subscriptions.update(c.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    logAudit(auditClient, {
      action: 'client.subscription.cancel',
      category: 'security',
      entityType: 'client',
      entityId: c.id,
      actorType: 'admin',
      actorId: req.adminUser ? req.adminUser.id : null,
      actorLabel: req.adminUser ? req.adminUser.email : null,
      summary: `Admin cancelou a assinatura de "${c.name}" (fim do período)`,
      metadata: { stripeSubscriptionId: c.stripeSubscriptionId },
    });
    res.json({ success: true, cancelAtPeriodEnd: updated.cancel_at_period_end });
  } catch (err) {
    console.error('[admin/subscriptions cancel]', err);
    res.status(500).json({ error: 'Erro ao cancelar assinatura' });
  }
});

module.exports = router;
