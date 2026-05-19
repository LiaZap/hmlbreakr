/**
 * BPO — Alertas pro DONO do restaurante (mostrados no Dashboard home)
 * Endpoint leve com contadores das pendências mais urgentes.
 *
 * GET /:hash/alerts → counters + items mais urgentes (top 5 cada)
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireBpoClient, requireBpoOperator } = require('./middleware');
const { stripOnbTag } = require('../../services/onboardingSync');

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

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
      prisma.payable.count({
        where: { clientId, dueDate: { lt: now }, status: { in: ['pending', 'paid_partial'] } },
      }),
      prisma.payable.count({
        where: { clientId, dueDate: { gte: now, lte: in7Days }, status: { in: ['pending', 'scheduled'] } },
      }),
      prisma.receivable.count({
        where: { clientId, status: { in: ['pending', 'received_partial'] } },
      }),
      prisma.bankTransaction.count({
        where: { bankAccount: { clientId }, reconciledType: null },
      }),
      prisma.whatsappMessage.count({
        where: { clientId, status: 'pending' },
      }),
      prisma.bpoTask.count({
        where: { clientId, status: 'open' },
      }),
      prisma.bankAccount.aggregate({
        where: { clientId, active: true },
        _sum: { currentBalance: true },
      }),
      // Top 5 contas vencidas (mais antigas primeiro)
      prisma.payable.findMany({
        where: { clientId, dueDate: { lt: now }, status: { in: ['pending', 'paid_partial'] } },
        orderBy: { dueDate: 'asc' },
        take: 5,
        include: { supplier: { select: { name: true } } },
      }),
      // Top 5 vencendo nos próximos 7 dias
      prisma.payable.findMany({
        where: { clientId, dueDate: { gte: now, lte: in7Days }, status: { in: ['pending', 'scheduled'] } },
        orderBy: { dueDate: 'asc' },
        take: 5,
        include: { supplier: { select: { name: true } } },
      }),
      // Pagamentos aguardando aprovação do dono
      prisma.payable.count({
        where: { clientId, requiresApproval: true, approvedAt: null, rejectedAt: null },
      }),
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
        bankBalance: Number(bankBalance._sum.currentBalance || 0),
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
        daysOverdue: Math.ceil((now - p.dueDate) / 86400000),
      })),
      topDueSoon: topDueSoon.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        remainingAmount: Number(p.remainingAmount),
        dueDate: p.dueDate,
        supplier: p.supplier?.name,
        description: stripOnbTag(p.description),
        daysUntilDue: Math.ceil((p.dueDate - now) / 86400000),
      })),
    });
  } catch (err) {
    console.error('[bpo alerts]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
