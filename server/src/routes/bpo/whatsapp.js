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
const { PrismaClient } = require('@prisma/client');
const { requireBpoClient, requireBpoOperator } = require('./middleware');

const prisma = new PrismaClient();

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

    const msg = await prisma.whatsappMessage.create({
      data: {
        fromNumber: normalized.fromNumber,
        senderName: normalized.senderName,
        messageType: normalized.messageType,
        textContent: normalized.textContent,
        mediaUrl: normalized.mediaUrl,
        mediaCaption: normalized.mediaCaption,
        rawJson: JSON.stringify(payload),
        status: 'pending',
      },
    });

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
    const items = await prisma.whatsappMessage.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { client: { select: { name: true, hash: true } } },
    });
    res.json({ items, total: items.length });
  } catch (err) {
    console.error(`[whatsapp] ${err?.message || err}`); res.status(500).json({ error: 'Erro interno' });
  }
});

inboxGlobalRouter.post('/messages/:id/assign-client', async (req, res) => {
  try {
    const { clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: 'clientId obrigatório' });
    const msg = await prisma.whatsappMessage.update({
      where: { id: req.params.id },
      data: { clientId },
    });
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
    const items = await prisma.whatsappMessage.findMany({
      where: { clientId: req.bpoClient.id, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
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

    const msg = await prisma.whatsappMessage.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
    if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });

    const amountNum = parseFloat(amount);
    let created;
    if (type === 'payable') {
      created = await prisma.payable.create({
        data: {
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
        },
      });
    } else {
      created = await prisma.receivable.create({
        data: {
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
        },
      });
    }

    await prisma.whatsappMessage.update({
      where: { id: msg.id },
      data: {
        status: 'validated',
        validatedAt: new Date(),
        ...(type === 'payable' ? { createdPayableId: created.id } : { createdReceivableId: created.id }),
      },
    });

    res.json({ success: true, type, created });
  } catch (err) {
    console.error(`[whatsapp validate] ${err?.message || err}`);
    res.status(500).json({ error: 'Erro ao validar mensagem' });
  }
});

inboxRouter.post('/messages/:id/discard', async (req, res) => {
  try {
    const msg = await prisma.whatsappMessage.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
    if (!msg) return res.status(404).json({ error: 'Não encontrada' });
    const updated = await prisma.whatsappMessage.update({
      where: { id: req.params.id },
      data: { status: 'discarded' },
    });
    res.json(updated);
  } catch (err) {
    console.error(`[whatsapp] ${err?.message || err}`); res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = { webhookRouter, inboxGlobalRouter, inboxRouter };
