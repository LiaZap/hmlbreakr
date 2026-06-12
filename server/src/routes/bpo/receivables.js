/**
 * BPO — Contas a Receber (Receivable)
 * Estrutura espelha Payable, mas com payerName em vez de supplier + paymentMethodId.
 */

const express = require('express');
const { db } = require('../../db/client');
const t = require('../../db/schema-bpo');
const {
  eq, and, or, ne, gt, gte, lt, lte, inArray, notInArray, isNull, isNotNull,
  desc, asc, sql, count, getTableColumns,
} = require('drizzle-orm');
const crypto = require('crypto');
const { requireBpoClient, requireBpoOperator } = require('./middleware');

const router = express.Router({ mergeParams: true });

router.use(requireBpoOperator);
router.use(requireBpoClient);

const advanceDate = (date, frequency, count = 1) => {
  const d = new Date(date);
  switch (frequency) {
    case 'weekly': d.setDate(d.getDate() + 7 * count); break;
    case 'monthly': d.setMonth(d.getMonth() + count); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3 * count); break;
    case 'semiannual': d.setMonth(d.getMonth() + 6 * count); break;
    case 'yearly': d.setFullYear(d.getFullYear() + count); break;
    default: d.setMonth(d.getMonth() + count);
  }
  return d;
};

router.get('/', async (req, res) => {
  try {
    const { status, paymentMethodId, categoryId, dueFrom, dueTo, search, page = 1, pageSize = 50 } = req.query;
    const conds = [eq(t.receivable.clientId, req.bpoClient.id)];
    if (status) conds.push(eq(t.receivable.status, status));
    if (paymentMethodId) conds.push(eq(t.receivable.paymentMethodId, paymentMethodId));
    if (categoryId) conds.push(eq(t.receivable.categoryId, categoryId));
    if (dueFrom) conds.push(gte(t.receivable.dueDate, new Date(dueFrom)));
    if (dueTo) conds.push(lte(t.receivable.dueDate, new Date(dueTo)));
    if (search) {
      const like = `%${search}%`;
      conds.push(or(
        sql`${t.receivable.description} ILIKE ${like}`,
        sql`${t.receivable.invoiceNumber} ILIKE ${like}`,
        sql`${t.receivable.payerName} ILIKE ${like}`,
      ));
    }
    const where = and(...conds);
    const take = parseInt(pageSize, 10);
    const skip = (parseInt(page, 10) - 1) * take;

    const summaryWhere = and(where, inArray(t.receivable.status, ['pending', 'received_partial']));

    const [itemsRaw, [{ n: total }], [{ s: pendingSum }]] = await Promise.all([
      db.select({
        ...getTableColumns(t.receivable),
        paymentMethod: { id: t.paymentMethod.id, name: t.paymentMethod.name, type: t.paymentMethod.type },
        category: { id: t.financialCategory.id, name: t.financialCategory.name, color: t.financialCategory.color },
      })
        .from(t.receivable)
        .leftJoin(t.paymentMethod, eq(t.receivable.paymentMethodId, t.paymentMethod.id))
        .leftJoin(t.financialCategory, eq(t.receivable.categoryId, t.financialCategory.id))
        .where(where)
        .orderBy(asc(t.receivable.dueDate))
        .limit(take)
        .offset(skip),
      db.select({ n: count() }).from(t.receivable).where(where),
      db.select({ s: sql`coalesce(sum(${t.receivable.remainingAmount}),0)` }).from(t.receivable).where(summaryWhere),
    ]);

    // _count: { payments, installments } — contagens por id (mantém shape do Prisma)
    const items = await Promise.all(itemsRaw.map(async (it) => {
      const [[{ n: payments }], [{ n: installments }]] = await Promise.all([
        db.select({ n: count() }).from(t.paymentTransaction).where(eq(t.paymentTransaction.receivableId, it.id)),
        db.select({ n: count() }).from(t.receivable).where(eq(t.receivable.parentId, it.id)),
      ]);
      // Prisma retorna null em relações ausentes; leftJoin sem match já vem com campos null
      return { ...it, _count: { payments, installments } };
    }));

    res.json({
      items,
      total,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      pendingTotal: pendingSum || 0,
    });
  } catch (err) {
    console.error('[bpo receivables list]', err);
    res.status(500).json({ error: 'Erro ao listar contas a receber' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [item] = await db.select()
      .from(t.receivable)
      .where(and(eq(t.receivable.id, req.params.id), eq(t.receivable.clientId, req.bpoClient.id)))
      .limit(1);
    if (!item) return res.status(404).json({ error: 'Conta a receber não encontrada' });

    const [paymentMethod, category, paymentsRaw, installments, recurrenceRows] = await Promise.all([
      item.paymentMethodId
        ? db.select().from(t.paymentMethod).where(eq(t.paymentMethod.id, item.paymentMethodId)).limit(1)
        : Promise.resolve([]),
      item.categoryId
        ? db.select().from(t.financialCategory).where(eq(t.financialCategory.id, item.categoryId)).limit(1)
        : Promise.resolve([]),
      db.select({
        ...getTableColumns(t.paymentTransaction),
        bankAccount: { bankName: t.bankAccount.bankName, account: t.bankAccount.account },
      })
        .from(t.paymentTransaction)
        .leftJoin(t.bankAccount, eq(t.paymentTransaction.bankAccountId, t.bankAccount.id))
        .where(eq(t.paymentTransaction.receivableId, item.id))
        .orderBy(desc(t.paymentTransaction.paidAt)),
      db.select().from(t.receivable)
        .where(eq(t.receivable.parentId, item.id))
        .orderBy(asc(t.receivable.installmentNumber)),
      item.recurrenceId
        ? db.select().from(t.recurrence).where(eq(t.recurrence.id, item.recurrenceId)).limit(1)
        : Promise.resolve([]),
    ]);

    res.json({
      ...item,
      paymentMethod: paymentMethod[0] || null,
      category: category[0] || null,
      payments: paymentsRaw,
      installments,
      recurrence: recurrenceRows[0] || null,
    });
  } catch (err) {
    console.error('[bpo receivables get]', err);
    res.status(500).json({ error: 'Erro ao buscar' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { payerName, payerDocument, amount, dueDate, receiptForecast, emissionDate, invoiceNumber, description, categoryId, paymentMethodId, department, attachments, recurrence, installments } = req.body;

    if (!payerName || !amount || !dueDate) return res.status(400).json({ error: 'payerName, amount e dueDate obrigatórios' });
    const amountNum = parseFloat(amount);
    if (amountNum <= 0) return res.status(400).json({ error: 'amount deve ser positivo' });

    const baseData = {
      clientId: req.bpoClient.id,
      payerName: payerName.trim(),
      payerDocument: payerDocument || null,
      amount: amountNum,
      remainingAmount: amountNum,
      dueDate: new Date(dueDate),
      receiptForecast: receiptForecast ? new Date(receiptForecast) : new Date(dueDate),
      emissionDate: emissionDate ? new Date(emissionDate) : null,
      invoiceNumber: invoiceNumber || null,
      description: description?.trim() || null,
      categoryId: categoryId || null,
      paymentMethodId: paymentMethodId || null,
      department: department?.trim() || null,
      attachments: attachments ? JSON.stringify(attachments) : null,
      status: 'pending',
    };

    if (recurrence?.frequency) {
      const [rec] = await db.insert(t.recurrence).values({
        id: crypto.randomUUID(),
        frequency: recurrence.frequency,
        intervalCount: recurrence.intervalCount || 1,
        startDate: new Date(dueDate),
        occurrencesCount: recurrence.occurrencesCount || null,
      }).returning();
      const count = recurrence.occurrencesCount || 12;
      const created = [];
      for (let i = 0; i < count; i++) {
        const dueDateI = i === 0 ? new Date(dueDate) : advanceDate(dueDate, recurrence.frequency, i * (recurrence.intervalCount || 1));
        const [item] = await db.insert(t.receivable).values({
          id: crypto.randomUUID(),
          ...baseData,
          dueDate: dueDateI,
          receiptForecast: dueDateI,
          recurrenceId: rec.id,
          updatedAt: new Date(),
        }).returning();
        created.push(item);
      }
      return res.status(201).json({ recurrence: rec, items: created });
    }

    if (installments?.count && installments.count > 1) {
      const count = installments.count;
      const installmentAmount = +(amountNum / count).toFixed(2);
      const interval = installments.intervalCount || 1;
      const [parent] = await db.insert(t.receivable).values({
        id: crypto.randomUUID(),
        ...baseData,
        amount: installmentAmount,
        remainingAmount: installmentAmount,
        installmentNumber: 1,
        updatedAt: new Date(),
      }).returning();
      const created = [parent];
      for (let i = 1; i < count; i++) {
        const dueDateI = advanceDate(dueDate, 'monthly', i * interval);
        const [item] = await db.insert(t.receivable).values({
          id: crypto.randomUUID(),
          ...baseData,
          amount: installmentAmount,
          remainingAmount: installmentAmount,
          dueDate: dueDateI,
          receiptForecast: dueDateI,
          parentId: parent.id,
          installmentNumber: i + 1,
          updatedAt: new Date(),
        }).returning();
        created.push(item);
      }
      return res.status(201).json({ installments: created.length, items: created });
    }

    const [created] = await db.insert(t.receivable).values({
      id: crypto.randomUUID(),
      ...baseData,
      updatedAt: new Date(),
    }).returning();

    const [paymentMethod, category] = await Promise.all([
      created.paymentMethodId
        ? db.select().from(t.paymentMethod).where(eq(t.paymentMethod.id, created.paymentMethodId)).limit(1)
        : Promise.resolve([]),
      created.categoryId
        ? db.select().from(t.financialCategory).where(eq(t.financialCategory.id, created.categoryId)).limit(1)
        : Promise.resolve([]),
    ]);

    res.status(201).json({
      ...created,
      paymentMethod: paymentMethod[0] || null,
      category: category[0] || null,
    });
  } catch (err) {
    console.error('[bpo receivables create]', err);
    res.status(500).json({ error: 'Erro ao criar conta a receber' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const [existing] = await db.select()
      .from(t.receivable)
      .where(and(eq(t.receivable.id, req.params.id), eq(t.receivable.clientId, req.bpoClient.id)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Conta a receber não encontrada' });
    if (existing.status === 'received') return res.status(400).json({ error: 'Não é possível alterar conta já recebida' });

    const data = {};
    ['payerName', 'payerDocument', 'invoiceNumber', 'description', 'categoryId', 'paymentMethodId', 'department'].forEach((f) => {
      if (req.body[f] !== undefined) data[f] = req.body[f] || null;
    });
    if (req.body.amount !== undefined) {
      data.amount = parseFloat(req.body.amount);
      const received = Number(existing.amount) - Number(existing.remainingAmount);
      data.remainingAmount = Math.max(0, data.amount - received);
    }
    if (req.body.dueDate !== undefined) data.dueDate = new Date(req.body.dueDate);
    if (req.body.receiptForecast !== undefined) data.receiptForecast = new Date(req.body.receiptForecast);
    if (req.body.attachments !== undefined) data.attachments = JSON.stringify(req.body.attachments);

    const [item] = await db.update(t.receivable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(t.receivable.id, req.params.id))
      .returning();
    res.json(item);
  } catch (err) {
    console.error('[bpo receivables update]', err);
    res.status(500).json({ error: 'Erro ao atualizar' });
  }
});

// RECEBIMENTO (baixa total ou parcial)
router.post('/:id/receive', async (req, res) => {
  try {
    const { amount, bankAccountId, paidAt, notes } = req.body;
    if (!amount || !bankAccountId) return res.status(400).json({ error: 'amount e bankAccountId obrigatórios' });

    const [receivable] = await db.select()
      .from(t.receivable)
      .where(and(eq(t.receivable.id, req.params.id), eq(t.receivable.clientId, req.bpoClient.id)))
      .limit(1);
    if (!receivable) return res.status(404).json({ error: 'Conta a receber não encontrada' });
    if (receivable.status === 'received') return res.status(400).json({ error: 'Conta já está recebida' });

    const amountNum = parseFloat(amount);
    if (amountNum <= 0) return res.status(400).json({ error: 'amount deve ser positivo' });
    if (amountNum > Number(receivable.remainingAmount)) {
      return res.status(400).json({ error: `Valor maior que o saldo (R$ ${receivable.remainingAmount})` });
    }

    const newRemaining = Number(receivable.remainingAmount) - amountNum;
    const isPartial = newRemaining >= 0.01;  // BUG #2 FIX: threshold consistente

    // Valida que o banco existe e pertence ao cliente
    const [bank] = await db.select()
      .from(t.bankAccount)
      .where(and(eq(t.bankAccount.id, bankAccountId), eq(t.bankAccount.clientId, req.bpoClient.id)))
      .limit(1);
    if (!bank) return res.status(404).json({ error: 'Conta bancária não encontrada' });

    const result = await db.transaction(async (tx) => {
      const [txn] = await tx.insert(t.paymentTransaction).values({
        id: crypto.randomUUID(),
        receivableId: receivable.id,
        amount: amountNum,
        paidAt: paidAt ? new Date(paidAt) : new Date(),
        bankAccountId,
        isPartial,
        notes: notes?.trim() || null,
      }).returning();
      const [updated] = await tx.update(t.receivable)
        .set({
          remainingAmount: newRemaining,
          status: isPartial ? 'received_partial' : 'received',
          updatedAt: new Date(),
        })
        .where(eq(t.receivable.id, receivable.id))
        .returning();
      // BUG FIX: incrementar saldo do banco quando recebe
      await tx.update(t.bankAccount)
        .set({
          currentBalance: sql`${t.bankAccount.currentBalance} + ${amountNum}`,
          updatedAt: new Date(),
        })
        .where(eq(t.bankAccount.id, bankAccountId));
      return { transaction: txn, receivable: updated };
    });
    res.json(result);
  } catch (err) {
    console.error('[bpo receivables receive]', err);
    res.status(500).json({ error: 'Erro ao registrar recebimento' });
  }
});

// DELETE (soft delete: regra do projeto — delete físico é proibido. Marca status=cancelled)
router.delete('/:id', async (req, res) => {
  try {
    const [receivable] = await db.select()
      .from(t.receivable)
      .where(and(eq(t.receivable.id, req.params.id), eq(t.receivable.clientId, req.bpoClient.id)))
      .limit(1);
    if (!receivable) return res.status(404).json({ error: 'Conta a receber não encontrada' });
    if (receivable.status === 'received') {
      return res.status(409).json({ error: 'Não é possível cancelar: conta já foi recebida.' });
    }
    if (receivable.status === 'cancelled') {
      return res.json({ success: true, alreadyCancelled: true });
    }
    await db.update(t.receivable)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(t.receivable.id, req.params.id));
    res.json({ success: true, cancelled: true });
  } catch (err) {
    console.error('[bpo receivables delete]', err);
    res.status(500).json({ error: 'Erro ao excluir' });
  }
});

module.exports = router;
