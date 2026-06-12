/**
 * BPO — Cadastro de Meios de Pagamento
 * iFood, Aiqfome, cartões, PIX, dinheiro — com taxa % e dias de repasse.
 */

const express = require('express');
const { db } = require('../../db/client');
const t = require('../../db/schema-bpo');
const { eq, and, asc, count } = require('drizzle-orm');
const crypto = require('crypto');
const { requireBpoClient, requireBpoOperator } = require('./middleware');

const router = express.Router({ mergeParams: true });

router.use(requireBpoOperator);
router.use(requireBpoClient);

const VALID_TYPES = ['marketplace', 'card_credit', 'card_debit', 'pix', 'cash', 'transfer'];

router.get('/', async (req, res) => {
  try {
    const methods = await db.select()
      .from(t.paymentMethod)
      .where(and(
        eq(t.paymentMethod.clientId, req.bpoClient.id),
        eq(t.paymentMethod.active, true),
      ))
      .orderBy(asc(t.paymentMethod.name));

    // _count: { receivables: true } — contagem por meio de pagamento
    const items = await Promise.all(methods.map(async (m) => {
      const [r] = await db.select({ n: count() })
        .from(t.receivable)
        .where(eq(t.receivable.paymentMethodId, m.id));
      return { ...m, _count: { receivables: Number(r.n) } };
    }));

    res.json({ items, total: items.length });
  } catch (err) {
    console.error('[bpo payment-methods list]', err);
    res.status(500).json({ error: 'Erro ao listar meios de pagamento' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, type, feePercent, settlementDays } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'name e type obrigatórios' });
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: `type deve ser: ${VALID_TYPES.join(', ')}` });

    const [item] = await db.insert(t.paymentMethod).values({
      id: crypto.randomUUID(),
      clientId: req.bpoClient.id,
      name: name.trim(),
      type,
      feePercent: feePercent ? parseFloat(feePercent) : 0,
      settlementDays: settlementDays ? parseInt(settlementDays, 10) : 0,
      updatedAt: new Date().toISOString(),
    }).returning();
    res.status(201).json(item);
  } catch (err) {
    console.error('[bpo payment-methods create]', err);
    res.status(500).json({ error: 'Erro ao criar meio de pagamento' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const [existing] = await db.select()
      .from(t.paymentMethod)
      .where(and(
        eq(t.paymentMethod.id, req.params.id),
        eq(t.paymentMethod.clientId, req.bpoClient.id),
      ))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Meio de pagamento não encontrado' });

    const data = {};
    if (req.body.name !== undefined) data.name = req.body.name.trim();
    if (req.body.type !== undefined && VALID_TYPES.includes(req.body.type)) data.type = req.body.type;
    if (req.body.feePercent !== undefined) data.feePercent = parseFloat(req.body.feePercent) || 0;
    if (req.body.settlementDays !== undefined) data.settlementDays = parseInt(req.body.settlementDays, 10) || 0;
    if (req.body.active !== undefined) data.active = !!req.body.active;
    // Prisma @updatedAt: bump em todo update
    data.updatedAt = new Date().toISOString();

    const [item] = await db.update(t.paymentMethod)
      .set(data)
      .where(eq(t.paymentMethod.id, req.params.id))
      .returning();
    res.json(item);
  } catch (err) {
    console.error('[bpo payment-methods update]', err);
    res.status(500).json({ error: 'Erro ao atualizar meio de pagamento' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await db.select()
      .from(t.paymentMethod)
      .where(and(
        eq(t.paymentMethod.id, req.params.id),
        eq(t.paymentMethod.clientId, req.bpoClient.id),
      ))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Meio de pagamento não encontrado' });

    // Soft delete sempre — regra do projeto: delete físico é proibido
    await db.update(t.paymentMethod)
      .set({ active: false, updatedAt: new Date().toISOString() })
      .where(eq(t.paymentMethod.id, req.params.id));
    res.json({ success: true, softDeleted: true });
  } catch (err) {
    console.error('[bpo payment-methods delete]', err);
    res.status(500).json({ error: 'Erro ao excluir meio de pagamento' });
  }
});

module.exports = router;
