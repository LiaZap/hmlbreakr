/**
 * BPO — Contas a Receber (Receivable)
 * Estrutura espelha Payable, mas com payerName em vez de supplier + paymentMethodId.
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireBpoClient, requireBpoOperator } = require('./middleware');

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

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
    const where = {
      clientId: req.bpoClient.id,
      ...(status ? { status } : {}),
      ...(paymentMethodId ? { paymentMethodId } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(dueFrom || dueTo ? {
        dueDate: {
          ...(dueFrom ? { gte: new Date(dueFrom) } : {}),
          ...(dueTo ? { lte: new Date(dueTo) } : {}),
        }
      } : {}),
      ...(search ? {
        OR: [
          { description: { contains: search, mode: 'insensitive' } },
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
          { payerName: { contains: search, mode: 'insensitive' } },
        ]
      } : {}),
    };
    const [items, total, summary] = await Promise.all([
      prisma.receivable.findMany({
        where,
        skip: (parseInt(page, 10) - 1) * parseInt(pageSize, 10),
        take: parseInt(pageSize, 10),
        orderBy: { dueDate: 'asc' },
        include: {
          paymentMethod: { select: { id: true, name: true, type: true } },
          category: { select: { id: true, name: true, color: true } },
          _count: { select: { payments: true, installments: true } },
        },
      }),
      prisma.receivable.count({ where }),
      prisma.receivable.aggregate({
        where: { ...where, status: { in: ['pending', 'received_partial'] } },
        _sum: { remainingAmount: true },
      }),
    ]);
    res.json({
      items,
      total,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      pendingTotal: summary._sum.remainingAmount || 0,
    });
  } catch (err) {
    console.error('[bpo receivables list]', err);
    res.status(500).json({ error: 'Erro ao listar contas a receber' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await prisma.receivable.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
      include: {
        paymentMethod: true,
        category: true,
        payments: { orderBy: { paidAt: 'desc' }, include: { bankAccount: { select: { bankName: true, account: true } } } },
        installments: { orderBy: { installmentNumber: 'asc' } },
        recurrence: true,
      },
    });
    if (!item) return res.status(404).json({ error: 'Conta a receber não encontrada' });
    res.json(item);
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
      const rec = await prisma.recurrence.create({
        data: {
          frequency: recurrence.frequency,
          intervalCount: recurrence.intervalCount || 1,
          startDate: new Date(dueDate),
          occurrencesCount: recurrence.occurrencesCount || null,
        },
      });
      const count = recurrence.occurrencesCount || 12;
      const created = [];
      for (let i = 0; i < count; i++) {
        const dueDateI = i === 0 ? new Date(dueDate) : advanceDate(dueDate, recurrence.frequency, i * (recurrence.intervalCount || 1));
        const item = await prisma.receivable.create({
          data: { ...baseData, dueDate: dueDateI, receiptForecast: dueDateI, recurrenceId: rec.id },
        });
        created.push(item);
      }
      return res.status(201).json({ recurrence: rec, items: created });
    }

    if (installments?.count && installments.count > 1) {
      const count = installments.count;
      const installmentAmount = +(amountNum / count).toFixed(2);
      const interval = installments.intervalCount || 1;
      const parent = await prisma.receivable.create({
        data: { ...baseData, amount: installmentAmount, remainingAmount: installmentAmount, installmentNumber: 1 },
      });
      const created = [parent];
      for (let i = 1; i < count; i++) {
        const dueDateI = advanceDate(dueDate, 'monthly', i * interval);
        const item = await prisma.receivable.create({
          data: { ...baseData, amount: installmentAmount, remainingAmount: installmentAmount, dueDate: dueDateI, receiptForecast: dueDateI, parentId: parent.id, installmentNumber: i + 1 },
        });
        created.push(item);
      }
      return res.status(201).json({ installments: created.length, items: created });
    }

    const item = await prisma.receivable.create({ data: baseData, include: { paymentMethod: true, category: true } });
    res.status(201).json(item);
  } catch (err) {
    console.error('[bpo receivables create]', err);
    res.status(500).json({ error: 'Erro ao criar conta a receber' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.receivable.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
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

    const item = await prisma.receivable.update({ where: { id: req.params.id }, data });
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

    const receivable = await prisma.receivable.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
    if (!receivable) return res.status(404).json({ error: 'Conta a receber não encontrada' });
    if (receivable.status === 'received') return res.status(400).json({ error: 'Conta já está recebida' });

    const amountNum = parseFloat(amount);
    if (amountNum <= 0) return res.status(400).json({ error: 'amount deve ser positivo' });
    if (amountNum > Number(receivable.remainingAmount)) {
      return res.status(400).json({ error: `Valor maior que o saldo (R$ ${receivable.remainingAmount})` });
    }

    const newRemaining = Number(receivable.remainingAmount) - amountNum;
    const isPartial = newRemaining > 0.001;

    const result = await prisma.$transaction(async (tx) => {
      const txn = await tx.paymentTransaction.create({
        data: {
          receivableId: receivable.id,
          amount: amountNum,
          paidAt: paidAt ? new Date(paidAt) : new Date(),
          bankAccountId,
          isPartial,
          notes: notes?.trim() || null,
        },
      });
      const updated = await tx.receivable.update({
        where: { id: receivable.id },
        data: {
          remainingAmount: newRemaining,
          status: isPartial ? 'received_partial' : 'received',
        },
      });
      return { transaction: txn, receivable: updated };
    });
    res.json(result);
  } catch (err) {
    console.error('[bpo receivables receive]', err);
    res.status(500).json({ error: 'Erro ao registrar recebimento' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const receivable = await prisma.receivable.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
      include: { _count: { select: { payments: true } } },
    });
    if (!receivable) return res.status(404).json({ error: 'Conta a receber não encontrada' });
    if (receivable._count.payments > 0) {
      return res.status(409).json({ error: 'Não é possível excluir: já existem recebimentos. Cancele em vez de excluir.' });
    }
    await prisma.receivable.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('[bpo receivables delete]', err);
    res.status(500).json({ error: 'Erro ao excluir' });
  }
});

module.exports = router;
