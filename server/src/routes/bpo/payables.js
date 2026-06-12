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
const { db } = require('../../db/client');
const t = require('../../db/schema-bpo');
const {
  eq, and, or, ne, gt, gte, lt, lte, inArray, notInArray,
  isNull, isNotNull, desc, asc, sql, count, getTableColumns,
} = require('drizzle-orm');
const crypto = require('crypto');
const { requireBpoClient, requireBpoOperator } = require('./middleware');
const { stripOnbTag } = require('../../services/onboardingSync');

const router = express.Router({ mergeParams: true });

// Limpa a tag interna [onb:*] da descrição de um payable para exibição.
const cleanPayable = (p) => (p ? { ...p, description: stripOnbTag(p.description) } : p);

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

    const conds = [eq(t.payable.clientId, req.bpoClient.id)];
    if (status) conds.push(eq(t.payable.status, status));
    if (supplierId) conds.push(eq(t.payable.supplierId, supplierId));
    if (categoryId) conds.push(eq(t.payable.categoryId, categoryId));
    if (dueFrom) conds.push(gte(t.payable.dueDate, new Date(dueFrom)));
    if (dueTo) conds.push(lte(t.payable.dueDate, new Date(dueTo)));
    if (search) {
      const like = `%${search}%`;
      conds.push(or(
        sql`${t.payable.description} ILIKE ${like}`,
        sql`${t.payable.invoiceNumber} ILIKE ${like}`,
        sql`${t.supplier.name} ILIKE ${like}`,
      ));
    }
    const where = and(...conds);

    const take = parseInt(pageSize, 10);
    const skip = (parseInt(page, 10) - 1) * take;

    // include: supplier + category + recurrence via leftJoin (objetos aninhados)
    const rows = await db.select({
      ...getTableColumns(t.payable),
      supplier: { id: t.supplier.id, name: t.supplier.name },
      category: { id: t.financialCategory.id, name: t.financialCategory.name, color: t.financialCategory.color },
      recurrence: { id: t.recurrence.id, frequency: t.recurrence.frequency, occurrencesCount: t.recurrence.occurrencesCount },
    }).from(t.payable)
      .leftJoin(t.supplier, eq(t.payable.supplierId, t.supplier.id))
      .leftJoin(t.financialCategory, eq(t.payable.categoryId, t.financialCategory.id))
      .leftJoin(t.recurrence, eq(t.payable.recurrenceId, t.recurrence.id))
      .where(where)
      .orderBy(asc(t.payable.dueDate))
      .limit(take)
      .offset(skip);

    // _count: { payments, installments } — contagem por id
    const items = await Promise.all(rows.map(async (row) => {
      const [pc] = await db.select({ n: count() })
        .from(t.paymentTransaction)
        .where(eq(t.paymentTransaction.payableId, row.id));
      const [ic] = await db.select({ n: count() })
        .from(t.payable)
        .where(eq(t.payable.parentId, row.id));
      // Prisma retorna supplier/category/recurrence como null quando a FK é nula
      // (leftJoin sem match já devolve { id: null, ... }; normaliza p/ null).
      const supplier = row.supplier && row.supplier.id ? row.supplier : null;
      const category = row.category && row.category.id ? row.category : null;
      const recurrence = row.recurrence && row.recurrence.id ? row.recurrence : null;
      return {
        ...row,
        supplier,
        category,
        recurrence,
        _count: { payments: Number(pc.n), installments: Number(ic.n) },
      };
    }));

    // total (count com mesmo where)
    const [totalRow] = await db.select({ n: count() })
      .from(t.payable)
      .leftJoin(t.supplier, eq(t.payable.supplierId, t.supplier.id))
      .where(where);
    const total = Number(totalRow.n);

    // summary: _sum remainingAmount p/ status pendentes
    const [summaryRow] = await db.select({ s: sql`coalesce(sum(${t.payable.remainingAmount}), 0)` })
      .from(t.payable)
      .leftJoin(t.supplier, eq(t.payable.supplierId, t.supplier.id))
      .where(and(where, inArray(t.payable.status, ['pending', 'scheduled', 'paid_partial'])));
    const pendingTotal = Number(summaryRow.s) || 0;

    res.json({
      items: items.map(cleanPayable),
      total,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      pendingTotal,
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
    const [sample] = await db.select()
      .from(t.payable)
      .where(and(eq(t.payable.recurrenceId, recurrenceId), eq(t.payable.clientId, req.bpoClient.id)))
      .limit(1);
    if (!sample) return res.status(404).json({ error: 'Recorrência não encontrada' });

    // Cancela só payables NÃO pagas e com vencimento >= hoje
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = await db.update(t.payable)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(
        eq(t.payable.recurrenceId, recurrenceId),
        eq(t.payable.clientId, req.bpoClient.id),
        inArray(t.payable.status, ['pending', 'scheduled']),
        gte(t.payable.dueDate, today),
      ));

    // Marca o endDate da recorrência (não dá pra deletar, FKs)
    await db.update(t.recurrence)
      .set({ endDate: new Date(), updatedAt: new Date() })
      .where(eq(t.recurrence.id, recurrenceId));

    res.json({ canceledCount: result.rowCount });
  } catch (err) {
    console.error('[bpo payables cancel-recurrence]', err);
    res.status(500).json({ error: err.message });
  }
});

// === WORKFLOW DE APROVAÇÃO — DEVE vir antes de /:id (ordering Express) ===
router.get('/pending-approval', async (req, res) => {
  try {
    const rows = await db.select({
      ...getTableColumns(t.payable),
      supplier: { name: t.supplier.name, cnpj: t.supplier.cnpj },
      category: { name: t.financialCategory.name },
    }).from(t.payable)
      .leftJoin(t.supplier, eq(t.payable.supplierId, t.supplier.id))
      .leftJoin(t.financialCategory, eq(t.payable.categoryId, t.financialCategory.id))
      .where(and(
        eq(t.payable.clientId, req.bpoClient.id),
        eq(t.payable.requiresApproval, true),
        isNull(t.payable.approvedAt),
        isNull(t.payable.rejectedAt),
      ))
      .orderBy(asc(t.payable.scheduledAt));
    const items = rows.map((row) => ({
      ...row,
      supplier: row.supplier && row.supplier.name !== null ? row.supplier : null,
      category: row.category && row.category.name !== null ? row.category : null,
    }));
    res.json({ items: items.map(cleanPayable), total: items.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    // include: supplier + category + recurrence (objetos completos)
    const [row] = await db.select({
      ...getTableColumns(t.payable),
      supplier: getTableColumns(t.supplier),
      category: getTableColumns(t.financialCategory),
      recurrence: getTableColumns(t.recurrence),
    }).from(t.payable)
      .leftJoin(t.supplier, eq(t.payable.supplierId, t.supplier.id))
      .leftJoin(t.financialCategory, eq(t.payable.categoryId, t.financialCategory.id))
      .leftJoin(t.recurrence, eq(t.payable.recurrenceId, t.recurrence.id))
      .where(and(eq(t.payable.id, req.params.id), eq(t.payable.clientId, req.bpoClient.id)))
      .limit(1);
    if (!row) return res.status(404).json({ error: 'Conta a pagar não encontrada' });

    // payments: PaymentTransaction (paidAt desc) + bankAccount { bankName, account }
    const payments = await db.select({
      ...getTableColumns(t.paymentTransaction),
      bankAccount: { bankName: t.bankAccount.bankName, account: t.bankAccount.account },
    }).from(t.paymentTransaction)
      .leftJoin(t.bankAccount, eq(t.paymentTransaction.bankAccountId, t.bankAccount.id))
      .where(eq(t.paymentTransaction.payableId, row.id))
      .orderBy(desc(t.paymentTransaction.paidAt));

    // installments: Payable filhas (parentId) ordenadas por installmentNumber
    const installments = await db.select({
      id: t.payable.id,
      installmentNumber: t.payable.installmentNumber,
      amount: t.payable.amount,
      dueDate: t.payable.dueDate,
      status: t.payable.status,
    }).from(t.payable)
      .where(eq(t.payable.parentId, row.id))
      .orderBy(asc(t.payable.installmentNumber));

    const item = {
      ...row,
      supplier: row.supplier && row.supplier.id ? row.supplier : null,
      category: row.category && row.category.id ? row.category : null,
      recurrence: row.recurrence && row.recurrence.id ? row.recurrence : null,
      payments,
      installments,
    };
    res.json(cleanPayable(item));
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
      const [rec] = await db.insert(t.recurrence).values({
        id: crypto.randomUUID(),
        frequency: recurrence.frequency,
        intervalCount: recurrence.intervalCount || 1,
        startDate: new Date(dueDate),
        occurrencesCount: requestedCount || null,
        updatedAt: new Date(),
      }).returning();
      const count = requestedCount || 12;
      const created = [];
      for (let i = 0; i < count; i++) {
        const dueDateI = i === 0 ? new Date(dueDate) : advanceDate(dueDate, recurrence.frequency, i * (recurrence.intervalCount || 1));
        const [item] = await db.insert(t.payable).values({
          id: crypto.randomUUID(),
          ...baseData,
          dueDate: dueDateI,
          paymentForecast: dueDateI,
          recurrenceId: rec.id,
          updatedAt: new Date(),
        }).returning();
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
      const [parent] = await db.insert(t.payable).values({
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
        const [item] = await db.insert(t.payable).values({
          id: crypto.randomUUID(),
          ...baseData,
          amount: installmentAmount,
          remainingAmount: installmentAmount,
          dueDate: dueDateI,
          paymentForecast: dueDateI,
          parentId: parent.id,
          installmentNumber: i + 1,
          updatedAt: new Date(),
        }).returning();
        created.push(item);
      }
      return res.status(201).json({ installments: created.length, items: created });
    }

    // === SIMPLES ===
    const [created] = await db.insert(t.payable).values({
      id: crypto.randomUUID(),
      ...baseData,
      updatedAt: new Date(),
    }).returning();
    // include: { supplier: true, category: true }
    const [supplier] = created.supplierId
      ? await db.select().from(t.supplier).where(eq(t.supplier.id, created.supplierId)).limit(1)
      : [];
    const [category] = created.categoryId
      ? await db.select().from(t.financialCategory).where(eq(t.financialCategory.id, created.categoryId)).limit(1)
      : [];
    const item = { ...created, supplier: supplier || null, category: category || null };
    res.status(201).json(item);
  } catch (err) {
    console.error('[bpo payables create]', err);
    res.status(500).json({ error: 'Erro ao criar conta a pagar' });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const [existing] = await db.select()
      .from(t.payable)
      .where(and(eq(t.payable.id, req.params.id), eq(t.payable.clientId, req.bpoClient.id)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Conta a pagar não encontrada' });
    if (existing.status === 'paid') return res.status(400).json({ error: 'Não é possível alterar conta já paga' });

    const data = {};
    ['supplierId', 'invoiceNumber', 'description', 'categoryId', 'department'].forEach((f) => {
      if (req.body[f] !== undefined) data[f] = req.body[f] || null;
    });
    // Preserva a tag interna [onb:*]: o usuário vê/edita a descrição LIMPA,
    // mas o marcador de idempotência do onboarding não pode ser perdido.
    if (data.description !== undefined) {
      const tag = (existing.description || '').match(/\[onb:[^\]]*\]/);
      if (tag && (!data.description || !data.description.includes(tag[0]))) {
        data.description = `${data.description || ''} ${tag[0]}`.trim();
      }
    }
    if (req.body.amount !== undefined) {
      data.amount = parseFloat(req.body.amount);
      // recalcula remainingAmount considerando os pagamentos já feitos
      const paid = Number(existing.amount) - Number(existing.remainingAmount);
      data.remainingAmount = Math.max(0, data.amount - paid);
    }
    if (req.body.dueDate !== undefined) data.dueDate = new Date(req.body.dueDate);
    if (req.body.paymentForecast !== undefined) data.paymentForecast = new Date(req.body.paymentForecast);
    if (req.body.attachments !== undefined) data.attachments = JSON.stringify(req.body.attachments);

    const [item] = await db.update(t.payable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(t.payable.id, req.params.id))
      .returning();
    res.json(cleanPayable(item));
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

    const [payable] = await db.select()
      .from(t.payable)
      .where(and(eq(t.payable.id, req.params.id), eq(t.payable.clientId, req.bpoClient.id)))
      .limit(1);
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
    const [bank] = await db.select()
      .from(t.bankAccount)
      .where(and(eq(t.bankAccount.id, bankAccountId), eq(t.bankAccount.clientId, req.bpoClient.id)))
      .limit(1);
    if (!bank) return res.status(404).json({ error: 'Conta bancária não encontrada' });

    // Transação: cria PaymentTransaction + atualiza Payable + decrementa saldo do banco
    const result = await db.transaction(async (tx) => {
      const [txn] = await tx.insert(t.paymentTransaction).values({
        id: crypto.randomUUID(),
        payableId: payable.id,
        amount: amountNum,
        paidAt: paidAt ? new Date(paidAt) : new Date(),
        bankAccountId,
        isPartial,
        notes: notes?.trim() || null,
      }).returning();
      const [updated] = await tx.update(t.payable)
        .set({
          remainingAmount: newRemaining,
          status: isPartial ? 'paid_partial' : 'paid',
          updatedAt: new Date(),
        })
        .where(eq(t.payable.id, payable.id))
        .returning();
      // BUG FIX: atualizar saldo do banco (estava ficando intacto após pagamento)
      await tx.update(t.bankAccount)
        .set({
          currentBalance: sql`${t.bankAccount.currentBalance} - ${amountNum}`,
          updatedAt: new Date(),
        })
        .where(eq(t.bankAccount.id, bankAccountId));
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

    const [payable] = await db.select()
      .from(t.payable)
      .where(and(eq(t.payable.id, req.params.id), eq(t.payable.clientId, req.bpoClient.id)))
      .limit(1);
    if (!payable) return res.status(404).json({ error: 'Conta a pagar não encontrada' });

    const [item] = await db.update(t.payable)
      .set({
        status: 'scheduled',
        scheduledAt: new Date(scheduledAt),
        scheduledBankId: bankAccountId,
        scheduledStatus: 'sent',
        requiresApproval: requiresApproval === true,
        updatedAt: new Date(),
      })
      .where(eq(t.payable.id, req.params.id))
      .returning();
    res.json(item);
  } catch (err) {
    console.error('[bpo payables schedule]', err);
    res.status(500).json({ error: 'Erro ao agendar' });
  }
});

// === WORKFLOW DE APROVAÇÃO (dono aprova pagamentos agendados pelo BPO operador) ===
//
// IDOR fix (tenant-auditor #1): valida que o payable pertence ao cliente da
// URL antes de mutar. requireBpoClient apenas valida o hash da URL; ele NÃO
// amarra o :id do recurso ao tenant. Padrão findFirst já usado em /delete
// e /update neste mesmo arquivo (linhas 281-284, 323-325, 383-386, 447-450).
router.post('/:id/approve', async (req, res) => {
  try {
    const { approverEmail } = req.body;
    const [existing] = await db.select({ id: t.payable.id })
      .from(t.payable)
      .where(and(eq(t.payable.id, req.params.id), eq(t.payable.clientId, req.bpoClient.id)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Conta a pagar não encontrada' });
    const [item] = await db.update(t.payable)
      .set({
        approvedAt: new Date(),
        approvedBy: approverEmail || 'dono',
        scheduledStatus: 'approved',
        updatedAt: new Date(),
      })
      .where(eq(t.payable.id, existing.id))
      .returning();
    res.json(item);
  } catch (err) {
    console.error('[bpo payables approve]', err?.message);
    res.status(500).json({ error: 'Erro ao aprovar pagamento' });
  }
});

// IDOR fix (tenant-auditor #2): mesmo padrão do /approve acima.
router.post('/:id/reject', async (req, res) => {
  try {
    const { reason, approverEmail } = req.body;
    const [existing] = await db.select({ id: t.payable.id })
      .from(t.payable)
      .where(and(eq(t.payable.id, req.params.id), eq(t.payable.clientId, req.bpoClient.id)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Conta a pagar não encontrada' });
    const [item] = await db.update(t.payable)
      .set({
        rejectedAt: new Date(),
        approvedBy: approverEmail || 'dono',
        rejectionReason: reason || 'Sem motivo informado',
        scheduledStatus: 'rejected',
        // Volta status pra pending pra dono ou BPO operador re-agendar
        status: 'pending',
        scheduledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(t.payable.id, existing.id))
      .returning();
    res.json(item);
  } catch (err) {
    console.error('[bpo payables reject]', err?.message);
    res.status(500).json({ error: 'Erro ao rejeitar pagamento' });
  }
});

// DELETE (soft delete: regra do projeto — delete físico é proibido. Marca status=cancelled)
router.delete('/:id', async (req, res) => {
  try {
    const [payable] = await db.select()
      .from(t.payable)
      .where(and(eq(t.payable.id, req.params.id), eq(t.payable.clientId, req.bpoClient.id)))
      .limit(1);
    if (!payable) return res.status(404).json({ error: 'Conta a pagar não encontrada' });
    if (payable.status === 'paid') {
      return res.status(409).json({ error: 'Não é possível cancelar: conta já está paga.' });
    }
    if (payable.status === 'cancelled') {
      return res.json({ success: true, alreadyCancelled: true });
    }
    await db.update(t.payable)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(t.payable.id, req.params.id));
    res.json({ success: true, cancelled: true });
  } catch (err) {
    console.error('[bpo payables delete]', err);
    res.status(500).json({ error: 'Erro ao excluir' });
  }
});

module.exports = router;
