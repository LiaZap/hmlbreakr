/**
 * BPO — Contas a Pagar (Payable)
 * Suporta:
 * - Criação manual
 * - Recorrência (cria N ocorrências automaticamente)
 * - Parcelamento (cria parcelas vinculadas)
 * - Pagamento parcial (mantém saldo + histórico)
 * - Anexos (JSON array)
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireBpoClient, requireBpoOperator } = require('./middleware');

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

router.use(requireBpoOperator);
router.use(requireBpoClient);

// Helper: avança data conforme frequência
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

// LIST com filtros
router.get('/', async (req, res) => {
  try {
    const { status, supplierId, categoryId, dueFrom, dueTo, search, page = 1, pageSize = 50 } = req.query;
    const where = {
      clientId: req.bpoClient.id,
      ...(status ? { status } : {}),
      ...(supplierId ? { supplierId } : {}),
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
          { supplier: { name: { contains: search, mode: 'insensitive' } } },
        ]
      } : {}),
    };
    const [items, total, summary] = await Promise.all([
      prisma.payable.findMany({
        where,
        skip: (parseInt(page, 10) - 1) * parseInt(pageSize, 10),
        take: parseInt(pageSize, 10),
        orderBy: { dueDate: 'asc' },
        include: {
          supplier: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, color: true } },
          recurrence: { select: { id: true, frequency: true, occurrencesCount: true } },
          _count: { select: { payments: true, installments: true } },
        },
      }),
      prisma.payable.count({ where }),
      prisma.payable.aggregate({
        where: { ...where, status: { in: ['pending', 'scheduled', 'paid_partial'] } },
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
    console.error('[bpo payables list]', err);
    res.status(500).json({ error: 'Erro ao listar contas a pagar' });
  }
});

// === RECORRÊNCIA — cancelar parcelas futuras (mantém histórico de pagas) ===
// DEVE vir antes de /:id (ordering Express)
router.post('/recurrence/:recurrenceId/cancel-future', async (req, res) => {
  try {
    const { recurrenceId } = req.params;
    // Confere que a recorrência pertence ao cliente (via uma payable filha)
    const sample = await prisma.payable.findFirst({
      where: { recurrenceId, clientId: req.bpoClient.id },
    });
    if (!sample) return res.status(404).json({ error: 'Recorrência não encontrada' });

    // Cancela só payables NÃO pagas e com vencimento >= hoje
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = await prisma.payable.updateMany({
      where: {
        recurrenceId,
        clientId: req.bpoClient.id,
        status: { in: ['pending', 'scheduled'] },
        dueDate: { gte: today },
      },
      data: { status: 'cancelled' },
    });

    // Marca o endDate da recorrência (não dá pra deletar, FKs)
    await prisma.recurrence.update({
      where: { id: recurrenceId },
      data: { endDate: new Date() },
    });

    res.json({ canceledCount: result.count });
  } catch (err) {
    console.error('[bpo payables cancel-recurrence]', err);
    res.status(500).json({ error: err.message });
  }
});

// === WORKFLOW DE APROVAÇÃO — DEVE vir antes de /:id (ordering Express) ===
router.get('/pending-approval', async (req, res) => {
  try {
    const items = await prisma.payable.findMany({
      where: {
        clientId: req.bpoClient.id,
        requiresApproval: true,
        approvedAt: null,
        rejectedAt: null,
      },
      orderBy: { scheduledAt: 'asc' },
      include: {
        supplier: { select: { name: true, cnpj: true } },
        category: { select: { name: true } },
      },
    });
    res.json({ items, total: items.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await prisma.payable.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
      include: {
        supplier: true,
        category: true,
        payments: { orderBy: { paidAt: 'desc' }, include: { bankAccount: { select: { bankName: true, account: true } } } },
        installments: { orderBy: { installmentNumber: 'asc' }, select: { id: true, installmentNumber: true, amount: true, dueDate: true, status: true } },
        recurrence: true,
      },
    });
    if (!item) return res.status(404).json({ error: 'Conta a pagar não encontrada' });
    res.json(item);
  } catch (err) {
    console.error('[bpo payables get]', err);
    res.status(500).json({ error: 'Erro ao buscar conta a pagar' });
  }
});

// CREATE
router.post('/', async (req, res) => {
  try {
    const {
      supplierId, amount, dueDate, paymentForecast, emissionDate, invoiceNumber,
      description, categoryId, department, attachments, taxesRetained,
      // Recorrência
      recurrence, // { frequency, intervalCount, occurrencesCount }
      // Parcelamento
      installments, // { count, intervalCount } — gera N parcelas mensais
    } = req.body;

    if (!amount || !dueDate) return res.status(400).json({ error: 'amount e dueDate obrigatórios' });
    const amountNum = parseFloat(amount);
    if (amountNum <= 0) return res.status(400).json({ error: 'amount deve ser positivo' });

    const baseData = {
      clientId: req.bpoClient.id,
      supplierId: supplierId || null,
      amount: amountNum,
      remainingAmount: amountNum,
      dueDate: new Date(dueDate),
      paymentForecast: paymentForecast ? new Date(paymentForecast) : new Date(dueDate),
      emissionDate: emissionDate ? new Date(emissionDate) : null,
      invoiceNumber: invoiceNumber || null,
      description: description?.trim() || null,
      categoryId: categoryId || null,
      department: department?.trim() || null,
      attachments: attachments ? JSON.stringify(attachments) : null,
      taxesRetained: taxesRetained ? JSON.stringify(taxesRetained) : null,
      status: 'pending',
    };

    // === RECORRÊNCIA ===
    if (recurrence?.frequency) {
      // BUG #3 FIX: validar mínimo 1 e máximo razoável
      const requestedCount = parseInt(recurrence.occurrencesCount, 10);
      if (recurrence.occurrencesCount !== undefined && (isNaN(requestedCount) || requestedCount < 1)) {
        return res.status(400).json({ error: 'occurrencesCount deve ser >= 1' });
      }
      if (requestedCount > 120) {
        return res.status(400).json({ error: 'Máximo 120 ocorrências por vez' });
      }
      const rec = await prisma.recurrence.create({
        data: {
          frequency: recurrence.frequency,
          intervalCount: recurrence.intervalCount || 1,
          startDate: new Date(dueDate),
          occurrencesCount: requestedCount || null,
        },
      });
      const count = requestedCount || 12;
      const created = [];
      for (let i = 0; i < count; i++) {
        const dueDateI = i === 0 ? new Date(dueDate) : advanceDate(dueDate, recurrence.frequency, i * (recurrence.intervalCount || 1));
        const item = await prisma.payable.create({
          data: { ...baseData, dueDate: dueDateI, paymentForecast: dueDateI, recurrenceId: rec.id },
        });
        created.push(item);
      }
      return res.status(201).json({ recurrence: rec, items: created });
    }

    // === PARCELAMENTO ===
    if (installments?.count && installments.count > 1) {
      const count = installments.count;
      const installmentAmount = +(amountNum / count).toFixed(2);
      const interval = installments.intervalCount || 1;
      // Cria parcela 1 (parent)
      const parent = await prisma.payable.create({
        data: {
          ...baseData,
          amount: installmentAmount,
          remainingAmount: installmentAmount,
          installmentNumber: 1,
        },
      });
      const created = [parent];
      for (let i = 1; i < count; i++) {
        const dueDateI = advanceDate(dueDate, 'monthly', i * interval);
        const item = await prisma.payable.create({
          data: {
            ...baseData,
            amount: installmentAmount,
            remainingAmount: installmentAmount,
            dueDate: dueDateI,
            paymentForecast: dueDateI,
            parentId: parent.id,
            installmentNumber: i + 1,
          },
        });
        created.push(item);
      }
      return res.status(201).json({ installments: created.length, items: created });
    }

    // === SIMPLES ===
    const item = await prisma.payable.create({ data: baseData, include: { supplier: true, category: true } });
    res.status(201).json(item);
  } catch (err) {
    console.error('[bpo payables create]', err);
    res.status(500).json({ error: 'Erro ao criar conta a pagar' });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.payable.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
    if (!existing) return res.status(404).json({ error: 'Conta a pagar não encontrada' });
    if (existing.status === 'paid') return res.status(400).json({ error: 'Não é possível alterar conta já paga' });

    const data = {};
    ['supplierId', 'invoiceNumber', 'description', 'categoryId', 'department'].forEach((f) => {
      if (req.body[f] !== undefined) data[f] = req.body[f] || null;
    });
    if (req.body.amount !== undefined) {
      data.amount = parseFloat(req.body.amount);
      // recalcula remainingAmount considerando os pagamentos já feitos
      const paid = Number(existing.amount) - Number(existing.remainingAmount);
      data.remainingAmount = Math.max(0, data.amount - paid);
    }
    if (req.body.dueDate !== undefined) data.dueDate = new Date(req.body.dueDate);
    if (req.body.paymentForecast !== undefined) data.paymentForecast = new Date(req.body.paymentForecast);
    if (req.body.attachments !== undefined) data.attachments = JSON.stringify(req.body.attachments);

    const item = await prisma.payable.update({ where: { id: req.params.id }, data });
    res.json(item);
  } catch (err) {
    console.error('[bpo payables update]', err);
    res.status(500).json({ error: 'Erro ao atualizar conta a pagar' });
  }
});

// PAGAMENTO (baixa total ou parcial)
router.post('/:id/pay', async (req, res) => {
  try {
    const { amount, bankAccountId, paidAt, notes } = req.body;
    if (!amount || !bankAccountId) return res.status(400).json({ error: 'amount e bankAccountId obrigatórios' });

    const payable = await prisma.payable.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
    if (!payable) return res.status(404).json({ error: 'Conta a pagar não encontrada' });
    if (payable.status === 'paid') return res.status(400).json({ error: 'Conta já está paga' });

    const amountNum = parseFloat(amount);
    if (amountNum <= 0) return res.status(400).json({ error: 'amount deve ser positivo' });
    if (amountNum > Number(payable.remainingAmount)) {
      return res.status(400).json({ error: `Valor maior que o saldo (R$ ${payable.remainingAmount})` });
    }

    const newRemaining = Number(payable.remainingAmount) - amountNum;
    const isPartial = newRemaining >= 0.01;  // BUG #2 FIX: threshold consistente (1 centavo)

    // Valida que o banco existe e pertence ao cliente
    const bank = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, clientId: req.bpoClient.id },
    });
    if (!bank) return res.status(404).json({ error: 'Conta bancária não encontrada' });

    // Transação: cria PaymentTransaction + atualiza Payable + decrementa saldo do banco
    const result = await prisma.$transaction(async (tx) => {
      const txn = await tx.paymentTransaction.create({
        data: {
          payableId: payable.id,
          amount: amountNum,
          paidAt: paidAt ? new Date(paidAt) : new Date(),
          bankAccountId,
          isPartial,
          notes: notes?.trim() || null,
        },
      });
      const updated = await tx.payable.update({
        where: { id: payable.id },
        data: {
          remainingAmount: newRemaining,
          status: isPartial ? 'paid_partial' : 'paid',
        },
      });
      // BUG FIX: atualizar saldo do banco (estava ficando intacto após pagamento)
      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: { currentBalance: { decrement: amountNum } },
      });
      return { transaction: txn, payable: updated };
    });
    res.json(result);
  } catch (err) {
    console.error('[bpo payables pay]', err);
    res.status(500).json({ error: 'Erro ao registrar pagamento' });
  }
});

// AGENDAMENTO no banco (Fase 4 — por enquanto só marca como agendado)
router.post('/:id/schedule', async (req, res) => {
  try {
    const { scheduledAt, bankAccountId, requiresApproval } = req.body;
    if (!scheduledAt || !bankAccountId) return res.status(400).json({ error: 'scheduledAt e bankAccountId obrigatórios' });

    const payable = await prisma.payable.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
    if (!payable) return res.status(404).json({ error: 'Conta a pagar não encontrada' });

    const item = await prisma.payable.update({
      where: { id: req.params.id },
      data: {
        status: 'scheduled',
        scheduledAt: new Date(scheduledAt),
        scheduledBankId: bankAccountId,
        scheduledStatus: 'sent',
        requiresApproval: requiresApproval === true,
      },
    });
    res.json(item);
  } catch (err) {
    console.error('[bpo payables schedule]', err);
    res.status(500).json({ error: 'Erro ao agendar' });
  }
});

// === WORKFLOW DE APROVAÇÃO (dono aprova pagamentos agendados pelo BPO operador) ===
router.post('/:id/approve', async (req, res) => {
  try {
    const { approverEmail } = req.body;
    const item = await prisma.payable.update({
      where: { id: req.params.id },
      data: {
        approvedAt: new Date(),
        approvedBy: approverEmail || 'dono',
        scheduledStatus: 'approved',
      },
    });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const { reason, approverEmail } = req.body;
    const item = await prisma.payable.update({
      where: { id: req.params.id },
      data: {
        rejectedAt: new Date(),
        approvedBy: approverEmail || 'dono',
        rejectionReason: reason || 'Sem motivo informado',
        scheduledStatus: 'rejected',
        // Volta status pra pending pra dono ou BPO operador re-agendar
        status: 'pending',
        scheduledAt: null,
      },
    });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE (soft delete: regra do projeto — delete físico é proibido. Marca status=cancelled)
router.delete('/:id', async (req, res) => {
  try {
    const payable = await prisma.payable.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
    if (!payable) return res.status(404).json({ error: 'Conta a pagar não encontrada' });
    if (payable.status === 'paid') {
      return res.status(409).json({ error: 'Não é possível cancelar: conta já está paga.' });
    }
    if (payable.status === 'cancelled') {
      return res.json({ success: true, alreadyCancelled: true });
    }
    await prisma.payable.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
    });
    res.json({ success: true, cancelled: true });
  } catch (err) {
    console.error('[bpo payables delete]', err);
    res.status(500).json({ error: 'Erro ao excluir' });
  }
});

module.exports = router;
