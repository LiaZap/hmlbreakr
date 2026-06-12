/**
 * BPO — Alertas pro DONO do restaurante (mostrados no Dashboard home)
 * Endpoint leve com contadores das pendências mais urgentes.
 *
 * GET /:hash/alerts → counters + items mais urgentes (top 5 cada)
 */

const express = require('express');
const { db } = require('../../db/client');
const t = require('../../db/schema-bpo');
const {
  eq, and, or, ne, gt, gte, lt, lte, inArray, notInArray,
  isNull, isNotNull, desc, asc, sql, count, getTableColumns,
} = require('drizzle-orm');
const { requireBpoClient, requireBpoOperator } = require('./middleware');
const { stripOnbTag } = require('../../services/onboardingSync');

const router = express.Router({ mergeParams: true });

router.use(requireBpoOperator);
router.use(requireBpoClient);

router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 86400000);
    const clientId = req.bpoClient.id;

    const [
      overduePay,
      dueSoonPay,
      pendingRec,
      unconciliatedTx,
      whatsappPending,
      tasksOpen,
      bankBalance,
      topOverdue,
      topDueSoon,
      pendingApproval,
    ] = await Promise.all([
      db.select({ n: count() }).from(t.payable).where(and(
        eq(t.payable.clientId, clientId),
        lt(t.payable.dueDate, now),
        inArray(t.payable.status, ['pending', 'paid_partial']),
      )).then(([r]) => r.n),
      db.select({ n: count() }).from(t.payable).where(and(
        eq(t.payable.clientId, clientId),
        gte(t.payable.dueDate, now),
        lte(t.payable.dueDate, in7Days),
        inArray(t.payable.status, ['pending', 'scheduled']),
      )).then(([r]) => r.n),
      db.select({ n: count() }).from(t.receivable).where(and(
        eq(t.receivable.clientId, clientId),
        inArray(t.receivable.status, ['pending', 'received_partial']),
      )).then(([r]) => r.n),
      // bankTransaction com filtro pela conta (BankTransaction.bankAccountId → BankAccount.clientId)
      db.select({ n: count() }).from(t.bankTransaction)
        .innerJoin(t.bankAccount, eq(t.bankTransaction.bankAccountId, t.bankAccount.id))
        .where(and(
          eq(t.bankAccount.clientId, clientId),
          isNull(t.bankTransaction.reconciledType),
        )).then(([r]) => r.n),
      db.select({ n: count() }).from(t.whatsappMessage).where(and(
        eq(t.whatsappMessage.clientId, clientId),
        eq(t.whatsappMessage.status, 'pending'),
      )).then(([r]) => r.n),
      db.select({ n: count() }).from(t.bpoTask).where(and(
        eq(t.bpoTask.clientId, clientId),
        eq(t.bpoTask.status, 'open'),
      )).then(([r]) => r.n),
      db.select({ s: sql`coalesce(sum(${t.bankAccount.currentBalance}), 0)` }).from(t.bankAccount).where(and(
        eq(t.bankAccount.clientId, clientId),
        eq(t.bankAccount.active, true),
      )).then(([r]) => r.s),
      // Top 5 contas vencidas (mais antigas primeiro)
      db.select({
        ...getTableColumns(t.payable),
        supplier: { name: t.supplier.name },
      }).from(t.payable)
        .leftJoin(t.supplier, eq(t.payable.supplierId, t.supplier.id))
        .where(and(
          eq(t.payable.clientId, clientId),
          lt(t.payable.dueDate, now),
          inArray(t.payable.status, ['pending', 'paid_partial']),
        ))
        .orderBy(asc(t.payable.dueDate))
        .limit(5),
      // Top 5 vencendo nos próximos 7 dias
      db.select({
        ...getTableColumns(t.payable),
        supplier: { name: t.supplier.name },
      }).from(t.payable)
        .leftJoin(t.supplier, eq(t.payable.supplierId, t.supplier.id))
        .where(and(
          eq(t.payable.clientId, clientId),
          gte(t.payable.dueDate, now),
          lte(t.payable.dueDate, in7Days),
          inArray(t.payable.status, ['pending', 'scheduled']),
        ))
        .orderBy(asc(t.payable.dueDate))
        .limit(5),
      // Pagamentos aguardando aprovação do dono
      db.select({ n: count() }).from(t.payable).where(and(
        eq(t.payable.clientId, clientId),
        eq(t.payable.requiresApproval, true),
        isNull(t.payable.approvedAt),
        isNull(t.payable.rejectedAt),
      )).then(([r]) => r.n),
    ]);

    // Severity geral
    let severity = 'low';
    if (overduePay > 0) severity = 'high';
    if (overduePay > 5) severity = 'critical';

    res.json({
      counters: {
        overduePay,
        dueSoonPay,
        pendingRec,
        unconciliatedTx,
        whatsappPending,
        tasksOpen,
        pendingApproval,
        bankBalance: Number(bankBalance || 0),
      },
      severity,
      hasAlerts: overduePay > 0 || dueSoonPay > 0 || unconciliatedTx > 0,
      topOverdue: topOverdue.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        remainingAmount: Number(p.remainingAmount),
        dueDate: p.dueDate,
        supplier: p.supplier?.name,
        description: stripOnbTag(p.description),
        daysOverdue: Math.ceil((now - new Date(p.dueDate)) / 86400000),
      })),
      topDueSoon: topDueSoon.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        remainingAmount: Number(p.remainingAmount),
        dueDate: p.dueDate,
        supplier: p.supplier?.name,
        description: stripOnbTag(p.description),
        daysUntilDue: Math.ceil((new Date(p.dueDate) - now) / 86400000),
      })),
    });
  } catch (err) {
    console.error('[bpo alerts]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
