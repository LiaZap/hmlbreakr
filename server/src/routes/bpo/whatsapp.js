/**
 * BPO — WhatsApp Bot Inbox (Fase 5 stub)
 *
 * Webhook genérico que aceita Z-API/Evolution/Meta. Hoje só armazena.
 * Quando contrato Z-API estiver ativo:
 *   1. Configurar webhook do Z-API → POST /api/bpo/webhook/whatsapp
 *   2. OCR via OpenAI Vision pra extrair dados de imagens
 *   3. Bot responde automaticamente
 *
 * Exporta 2 routers:
 *   webhookRouter      — pra mount em /webhook (sem auth)
 *   inboxRouter        — pra mount em /:clientHash/whatsapp (com auth)
 *   inboxGlobalRouter  — pra mount em /whatsapp (multi-cliente, com auth de operador)
 */

const express = require('express');
const { db } = require('../../db/client');
const t = require('../../db/schema-bpo');
const { eq, and, or, ne, gt, gte, lt, lte, inArray, notInArray, isNull, isNotNull, desc, asc, sql, count, getTableColumns } = require('drizzle-orm');
const crypto = require('crypto');
const { requireBpoClient, requireBpoOperator } = require('./middleware');

// ============================================================================
// Helper: normaliza payloads de Z-API/Evolution/Meta
// ============================================================================
const normalizeWebhookPayload = (payload) => {
  if (payload?.phone) {
    return {
      fromNumber: payload.phone,
      senderName: payload.senderName || payload.notifyName,
      messageType: payload.image ? 'image' : payload.document ? 'document' : 'text',
      textContent: payload.text?.message || null,
      mediaUrl: payload.image?.imageUrl || payload.document?.documentUrl || null,
      mediaCaption: payload.image?.caption || payload.document?.caption || null,
    };
  }
  if (payload?.data?.key?.remoteJid) {
    return {
      fromNumber: payload.data.key.remoteJid.replace('@s.whatsapp.net', ''),
      senderName: payload.data.pushName,
      messageType: payload.data.message?.imageMessage ? 'image' : 'text',
      textContent: payload.data.message?.conversation || payload.data.message?.extendedTextMessage?.text || null,
      mediaUrl: payload.data.message?.imageMessage?.url || null,
      mediaCaption: payload.data.message?.imageMessage?.caption || null,
    };
  }
  return null;
};

// ============================================================================
// 1. Webhook público (sem auth) — POST /api/bpo/webhook/whatsapp
// ============================================================================
const webhookRouter = express.Router();
webhookRouter.post('/whatsapp', async (req, res) => {
  try {
    const payload = req.body;
    const normalized = normalizeWebhookPayload(payload);
    if (!normalized) return res.json({ ok: true, ignored: 'formato não reconhecido' });

    const [msg] = await db.insert(t.whatsappMessage).values({
      id: crypto.randomUUID(),
      fromNumber: normalized.fromNumber,
      senderName: normalized.senderName,
      messageType: normalized.messageType,
      textContent: normalized.textContent,
      mediaUrl: normalized.mediaUrl,
      mediaCaption: normalized.mediaCaption,
      rawJson: JSON.stringify(payload),
      status: 'pending',
      updatedAt: new Date(),
    }).returning();

    res.json({ ok: true, messageId: msg.id });
  } catch (err) {
    // pii-auditor #16: webhook PUBLICO (Z-API) — nao vazar err.message
    // cru (pode trazer meta.target do Prisma com phone/CPF da mensagem).
    console.error(`[whatsapp webhook] ${err?.message || err} (code=${err?.code || 'unknown'})`);
    // Sempre 200 pra não quebrar webhook do Z-API
    res.status(200).json({ ok: false, error: 'internal' });
  }
});

// ============================================================================
// 2. Inbox global (multi-cliente) — GET /api/bpo/whatsapp/inbox
// ============================================================================
const inboxGlobalRouter = express.Router();
inboxGlobalRouter.use(requireBpoOperator);

inboxGlobalRouter.get('/inbox', async (req, res) => {
  try {
    const items = await db.select({
      ...getTableColumns(t.whatsappMessage),
      client: { name: t.client.name, hash: t.client.hash },
    }).from(t.whatsappMessage)
      .leftJoin(t.client, eq(t.whatsappMessage.clientId, t.client.id))
      .where(eq(t.whatsappMessage.status, 'pending'))
      .orderBy(desc(t.whatsappMessage.createdAt))
      .limit(100);
    res.json({ items, total: items.length });
  } catch (err) {
    console.error(`[whatsapp] ${err?.message || err}`); res.status(500).json({ error: 'Erro interno' });
  }
});

inboxGlobalRouter.post('/messages/:id/assign-client', async (req, res) => {
  try {
    const { clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: 'clientId obrigatório' });
    const [msg] = await db.update(t.whatsappMessage)
      .set({ clientId, updatedAt: new Date() })
      .where(eq(t.whatsappMessage.id, req.params.id))
      .returning();
    res.json(msg);
  } catch (err) {
    console.error(`[whatsapp] ${err?.message || err}`); res.status(500).json({ error: 'Erro interno' });
  }
});

// ============================================================================
// 3. Endpoints por cliente — mount em /:clientHash/whatsapp
// ============================================================================
const inboxRouter = express.Router({ mergeParams: true });
inboxRouter.use(requireBpoOperator);
inboxRouter.use(requireBpoClient);

inboxRouter.get('/inbox', async (req, res) => {
  try {
    const items = await db.select().from(t.whatsappMessage)
      .where(and(
        eq(t.whatsappMessage.clientId, req.bpoClient.id),
        eq(t.whatsappMessage.status, 'pending'),
      ))
      .orderBy(desc(t.whatsappMessage.createdAt))
      .limit(100);
    res.json({ items, total: items.length });
  } catch (err) {
    console.error(`[whatsapp] ${err?.message || err}`); res.status(500).json({ error: 'Erro interno' });
  }
});

inboxRouter.post('/messages/:id/validate', async (req, res) => {
  try {
    const { type, amount, dueDate, supplierId, payerName, categoryId, paymentMethodId, description } = req.body;
    if (!type || !amount || !dueDate) return res.status(400).json({ error: 'type, amount e dueDate obrigatórios' });
    if (!['payable', 'receivable'].includes(type)) return res.status(400).json({ error: 'type deve ser payable ou receivable' });

    const [msg] = await db.select().from(t.whatsappMessage)
      .where(and(
        eq(t.whatsappMessage.id, req.params.id),
        eq(t.whatsappMessage.clientId, req.bpoClient.id),
      ))
      .limit(1);
    if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });

    const amountNum = parseFloat(amount);
    let created;
    if (type === 'payable') {
      [created] = await db.insert(t.payable).values({
        id: crypto.randomUUID(),
        clientId: req.bpoClient.id,
        supplierId: supplierId || null,
        amount: amountNum,
        remainingAmount: amountNum,
        dueDate: new Date(dueDate),
        paymentForecast: new Date(dueDate),
        categoryId: categoryId || null,
        description: description || msg.textContent || msg.mediaCaption || 'Lançamento via WhatsApp',
        status: 'pending',
        attachments: msg.mediaUrl ? JSON.stringify([{ url: msg.mediaUrl, type: msg.messageType, source: 'whatsapp' }]) : null,
        updatedAt: new Date(),
      }).returning();
    } else {
      [created] = await db.insert(t.receivable).values({
        id: crypto.randomUUID(),
        clientId: req.bpoClient.id,
        payerName: payerName || msg.senderName || 'Pagador via WhatsApp',
        amount: amountNum,
        remainingAmount: amountNum,
        dueDate: new Date(dueDate),
        receiptForecast: new Date(dueDate),
        categoryId: categoryId || null,
        paymentMethodId: paymentMethodId || null,
        description: description || msg.textContent || 'Lançamento via WhatsApp',
        status: 'pending',
        attachments: msg.mediaUrl ? JSON.stringify([{ url: msg.mediaUrl, type: msg.messageType, source: 'whatsapp' }]) : null,
        updatedAt: new Date(),
      }).returning();
    }

    await db.update(t.whatsappMessage)
      .set({
        status: 'validated',
        validatedAt: new Date(),
        updatedAt: new Date(),
        ...(type === 'payable' ? { createdPayableId: created.id } : { createdReceivableId: created.id }),
      })
      .where(eq(t.whatsappMessage.id, msg.id));

    res.json({ success: true, type, created });
  } catch (err) {
    console.error(`[whatsapp validate] ${err?.message || err}`);
    res.status(500).json({ error: 'Erro ao validar mensagem' });
  }
});

inboxRouter.post('/messages/:id/discard', async (req, res) => {
  try {
    const [msg] = await db.select().from(t.whatsappMessage)
      .where(and(
        eq(t.whatsappMessage.id, req.params.id),
        eq(t.whatsappMessage.clientId, req.bpoClient.id),
      ))
      .limit(1);
    if (!msg) return res.status(404).json({ error: 'Não encontrada' });
    const [updated] = await db.update(t.whatsappMessage)
      .set({ status: 'discarded', updatedAt: new Date() })
      .where(eq(t.whatsappMessage.id, req.params.id))
      .returning();
    res.json(updated);
  } catch (err) {
    console.error(`[whatsapp] ${err?.message || err}`); res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = { webhookRouter, inboxGlobalRouter, inboxRouter };
