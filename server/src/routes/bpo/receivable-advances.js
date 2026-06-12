/**
 * BAH-030 — Antecipação de Recebíveis
 *
 * Cliente cadastra antecipações de operadoras (cartão/marketplace) e o
 * sistema calcula:
 *  - dailyRate    = taxa diária equivalente da taxa mensal
 *  - totalDiscount= R$ desconto total da antecipação
 *  - finalValue   = R$ líquido após desconto
 *
 * Esses valores são refletidos no "Dinheiro na Mesa" do dashboard.
 */

const express = require('express');
const crypto = require('crypto');
const { db } = require('../../db/client');
const t = require('../../db/schema-bpo');
const {
  eq, and, or, ne, gt, gte, lt, lte, inArray, notInArray,
  isNull, isNotNull, desc, asc, sql, count, getTableColumns,
} = require('drizzle-orm');
const { requireBpoClient, requireBpoOperator } = require('./middleware');

const router = express.Router({ mergeParams: true });

router.use(requireBpoOperator);
router.use(requireBpoClient);

/**
 * Calcula taxa diária equivalente pela mensal: ((1 + i_m)^(1/30)) - 1
 * Ex: 2.99% a.m. → ~0.0986% a.d.
 */
const monthlyToDaily = (monthlyPct) => {
  const m = parseFloat(monthlyPct);
  if (!isFinite(m) || m <= 0) return 0;
  return Math.pow(1 + m / 100, 1 / 30) - 1;
};

const computeAdvance = ({ monthlyRate, averageValue, daysAdvanced }) => {
  const m = parseFloat(monthlyRate) || 0;
  const v = parseFloat(averageValue) || 0;
  const d = parseInt(daysAdvanced, 10) || 0;
  const dailyRate = monthlyToDaily(m);
  const totalDiscount = +(v * dailyRate * d).toFixed(2);
  const finalValue = +(v - totalDiscount).toFixed(2);
  return { dailyRate: +dailyRate.toFixed(6), totalDiscount, finalValue };
};

// Select padrão do paymentMethod relacionado (id, name, type) aninhado.
const advanceWithMethodSelect = {
  ...getTableColumns(t.receivableAdvance),
  paymentMethod: {
    id: t.paymentMethod.id,
    name: t.paymentMethod.name,
    type: t.paymentMethod.type,
  },
};

// Quando não há paymentMethodId, a relation deve vir null (igual ao Prisma),
// não um objeto { id: null, name: null, type: null }.
const normalizePaymentMethod = (row) => {
  if (row && row.paymentMethod && row.paymentMethod.id == null) {
    return { ...row, paymentMethod: null };
  }
  return row;
};

router.get('/', async (req, res) => {
  try {
    const rows = await db
      .select(advanceWithMethodSelect)
      .from(t.receivableAdvance)
      .leftJoin(t.paymentMethod, eq(t.receivableAdvance.paymentMethodId, t.paymentMethod.id))
      .where(and(
        eq(t.receivableAdvance.clientId, req.bpoClient.id),
        eq(t.receivableAdvance.active, true),
      ))
      .orderBy(desc(t.receivableAdvance.createdAt));
    const items = rows.map(normalizePaymentMethod);
    // Soma total perdido em desconto (todas antecipações ativas)
    const totalLostMonthly = items.reduce((acc, i) => acc + parseFloat(i.totalDiscount), 0);
    res.json({ items, total: items.length, totalLostMonthly: +totalLostMonthly.toFixed(2) });
  } catch (err) {
    console.error('[bpo advances list]', err);
    res.status(500).json({ error: 'Erro ao listar antecipações' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { description, paymentMethodId, monthlyRate, averageValue, daysAdvanced } = req.body;
    if (!description || !description.trim()) return res.status(400).json({ error: 'description obrigatório' });
    if (parseFloat(monthlyRate) <= 0) return res.status(400).json({ error: 'monthlyRate deve ser > 0' });
    if (parseFloat(averageValue) <= 0) return res.status(400).json({ error: 'averageValue deve ser > 0' });
    if (parseInt(daysAdvanced, 10) <= 0) return res.status(400).json({ error: 'daysAdvanced deve ser > 0' });

    const calc = computeAdvance({ monthlyRate, averageValue, daysAdvanced });

    const now = new Date().toISOString();
    const [created] = await db
      .insert(t.receivableAdvance)
      .values({
        id: crypto.randomUUID(),
        clientId: req.bpoClient.id,
        paymentMethodId: paymentMethodId || null,
        description: description.trim(),
        monthlyRate: parseFloat(monthlyRate),
        averageValue: parseFloat(averageValue),
        daysAdvanced: parseInt(daysAdvanced, 10),
        ...calc,
        updatedAt: now,
      })
      .returning();

    // Anexa paymentMethod (id, name, type) igual ao include do Prisma.
    const item = await attachPaymentMethod(created);
    res.status(201).json(item);
  } catch (err) {
    console.error('[bpo advances create]', err);
    res.status(500).json({ error: 'Erro ao criar antecipação' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { description, paymentMethodId, monthlyRate, averageValue, daysAdvanced } = req.body;
    const [existing] = await db
      .select()
      .from(t.receivableAdvance)
      .where(and(
        eq(t.receivableAdvance.id, req.params.id),
        eq(t.receivableAdvance.clientId, req.bpoClient.id),
      ))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Não encontrado' });

    // Se inputs mudaram, recalcula
    const m = monthlyRate != null ? parseFloat(monthlyRate) : parseFloat(existing.monthlyRate);
    const v = averageValue != null ? parseFloat(averageValue) : parseFloat(existing.averageValue);
    const d = daysAdvanced != null ? parseInt(daysAdvanced, 10) : existing.daysAdvanced;
    const calc = computeAdvance({ monthlyRate: m, averageValue: v, daysAdvanced: d });

    const [updated] = await db
      .update(t.receivableAdvance)
      .set({
        ...(description != null ? { description: String(description).trim() } : {}),
        ...(paymentMethodId !== undefined ? { paymentMethodId: paymentMethodId || null } : {}),
        monthlyRate: m,
        averageValue: v,
        daysAdvanced: d,
        ...calc,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(t.receivableAdvance.id, req.params.id))
      .returning();

    const item = await attachPaymentMethod(updated);
    res.json(item);
  } catch (err) {
    console.error('[bpo advances update]', err);
    res.status(500).json({ error: 'Erro ao atualizar antecipação' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await db
      .select()
      .from(t.receivableAdvance)
      .where(and(
        eq(t.receivableAdvance.id, req.params.id),
        eq(t.receivableAdvance.clientId, req.bpoClient.id),
      ))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Não encontrado' });
    // Soft delete pra preservar histórico
    await db
      .update(t.receivableAdvance)
      .set({ active: false, updatedAt: new Date().toISOString() })
      .where(eq(t.receivableAdvance.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error('[bpo advances delete]', err);
    res.status(500).json({ error: 'Erro ao excluir antecipação' });
  }
});

/**
 * Carrega o paymentMethod (id, name, type) e aninha no registro, replicando
 * o `include: { paymentMethod: { select: { id, name, type } } }` do Prisma.
 */
async function attachPaymentMethod(advance) {
  if (!advance) return advance;
  if (!advance.paymentMethodId) return { ...advance, paymentMethod: null };
  const [pm] = await db
    .select({ id: t.paymentMethod.id, name: t.paymentMethod.name, type: t.paymentMethod.type })
    .from(t.paymentMethod)
    .where(eq(t.paymentMethod.id, advance.paymentMethodId))
    .limit(1);
  return { ...advance, paymentMethod: pm || null };
}

module.exports = router;
