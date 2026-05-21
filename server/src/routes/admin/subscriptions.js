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
const { PrismaClient } = require('@prisma/client');
const { logAudit } = require('../../services/auditService');
const { createPortalSession, getStripe } = require('../../services/stripeService');

const router = express.Router();
const prisma = new PrismaClient();

// ─── GET / — lista + KPIs ──────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, q } = req.query;
    const where = { active: true };
    if (status) where.subscriptionStatus = status;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    const items = await prisma.client.findMany({
      where,
      select: {
        id: true, name: true, hash: true, email: true,
        subscriptionStatus: true, subscriptionPlan: true,
        trialEndsAt: true, currentPeriodEnd: true,
        pastDueSince: true, canceledAt: true,
        blockedByAdmin: true, blockedAt: true, blockedReason: true,
        stripeCustomerId: true, stripeSubscriptionId: true,
        createdAt: true,
      },
      orderBy: [{ subscriptionStatus: 'asc' }, { name: 'asc' }],
    });
    // KPIs sobre toda a base ativa (independente do filtro)
    const all = await prisma.client.findMany({
      where: { active: true },
      select: { subscriptionStatus: true, blockedByAdmin: true },
    });
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
    const client = await prisma.client.findUnique({ where: { id: req.params.clientId } });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });
    const events = await prisma.stripeEvent.findMany({
      where: { clientId: client.id },
      orderBy: { processedAt: 'desc' },
      take: 50,
      select: { id: true, type: true, processedAt: true },
    });
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
    const existing = await prisma.client.findUnique({ where: { id: req.params.clientId } });
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });
    const item = await prisma.client.update({
      where: { id: req.params.clientId },
      data: {
        blockedByAdmin: true,
        blockedAt: new Date(),
        blockedReason: String(reason).trim(),
        blockedByUserId: req.adminUser ? req.adminUser.id : null,
      },
      select: {
        id: true, name: true, blockedByAdmin: true, blockedAt: true, blockedReason: true,
      },
    });
    logAudit(prisma, {
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
    const existing = await prisma.client.findUnique({ where: { id: req.params.clientId } });
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });
    const item = await prisma.client.update({
      where: { id: req.params.clientId },
      data: {
        blockedByAdmin: false,
        blockedAt: null,
        blockedReason: null,
        blockedByUserId: null,
      },
      select: { id: true, name: true, blockedByAdmin: true },
    });
    logAudit(prisma, {
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
    const c = await prisma.client.findUnique({ where: { id: req.params.clientId } });
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
    const c = await prisma.client.findUnique({ where: { id: req.params.clientId } });
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
    logAudit(prisma, {
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
