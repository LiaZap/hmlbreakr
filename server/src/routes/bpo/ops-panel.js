/**
 * BPO — Painel do Operador (multi-cliente)
 * Endpoint pra dashboard do Gustavo: vê todos os clientes BPO ao mesmo tempo,
 * com pendências agregadas estilo Nibo (Caixa de entrada / Programar banco / Para conciliar).
 *
 * Endpoints:
 *   GET /:hash/ops-panel/overview   - Resumo com TODOS os clientes BPO (ignorar :hash, usa só pra auth)
 *   GET /:hash/ops-panel/tasks      - Lista de tarefas pendentes
 *   POST /:hash/ops-panel/tasks/:id/resolve - Marca task como resolvida
 *   POST /:hash/ops-panel/scan      - Re-gera tarefas auto pra todos clientes BPO
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireBpoOperator } = require('./middleware');

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

router.use(requireBpoOperator);

// === Overview multi-cliente ===
router.get('/overview', async (req, res) => {
  try {
    const clients = await prisma.client.findMany({
      where: { bpoEnabled: true, active: true },
      select: { id: true, hash: true, name: true, bpoActivatedAt: true },
      orderBy: { name: 'asc' },
    });

    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 86400000);

    const perClient = await Promise.all(clients.map(async (c) => {
      const [overduePay, dueSoonPay, pendingRec, unconciliatedTx, scheduled, banks] = await Promise.all([
        prisma.payable.count({ where: { clientId: c.id, dueDate: { lt: now }, status: { in: ['pending', 'paid_partial'] } } }),
        prisma.payable.count({ where: { clientId: c.id, dueDate: { gte: now, lte: in7Days }, status: { in: ['pending', 'scheduled'] } } }),
        prisma.receivable.count({ where: { clientId: c.id, status: { in: ['pending', 'received_partial'] } } }),
        prisma.bankTransaction.count({ where: { bankAccount: { clientId: c.id }, reconciledType: null } }),
        prisma.payable.count({ where: { clientId: c.id, status: 'scheduled' } }),
        prisma.bankAccount.aggregate({ where: { clientId: c.id, active: true }, _sum: { currentBalance: true } }),
      ]);
      const totalIssues = overduePay + unconciliatedTx;
      return {
        ...c,
        cards: {
          overduePay,    // contas vencidas
          dueSoonPay,    // vencendo em 7 dias
          pendingRec,    // a receber pendentes
          unconciliatedTx, // pra conciliar
          scheduled,     // programados no banco
        },
        totalIssues,
        balance: Number(banks._sum.currentBalance || 0),
        severity: overduePay > 5 ? 'critical' : overduePay > 0 ? 'high' : unconciliatedTx > 10 ? 'normal' : 'low',
      };
    }));

    // Agregado geral
    const totals = perClient.reduce((acc, c) => ({
      clients: acc.clients + 1,
      overduePay: acc.overduePay + c.cards.overduePay,
      dueSoonPay: acc.dueSoonPay + c.cards.dueSoonPay,
      pendingRec: acc.pendingRec + c.cards.pendingRec,
      unconciliatedTx: acc.unconciliatedTx + c.cards.unconciliatedTx,
      balance: acc.balance + c.balance,
    }), { clients: 0, overduePay: 0, dueSoonPay: 0, pendingRec: 0, unconciliatedTx: 0, balance: 0 });

    // Ordena: maior severidade primeiro
    const severityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    perClient.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.totalIssues - a.totalIssues);

    res.json({ clients: perClient, totals });
  } catch (err) {
    console.error('[bpo ops-panel overview]', err);
    res.status(500).json({ error: err.message });
  }
});

// === Tarefas BPO ===
router.get('/tasks', async (req, res) => {
  try {
    const { status = 'open', clientId } = req.query;
    const tasks = await prisma.bpoTask.findMany({
      where: {
        status: status === 'all' ? undefined : status,
        ...(clientId ? { clientId } : {}),
      },
      orderBy: [{ severity: 'asc' }, { dueAt: 'asc' }],
      include: { client: { select: { name: true, hash: true } } },
      take: 200,
    });
    res.json({ items: tasks, total: tasks.length });
  } catch (err) {
    console.error('[bpo ops-panel tasks]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/tasks/:id/resolve', async (req, res) => {
  try {
    const task = await prisma.bpoTask.update({
      where: { id: req.params.id },
      data: { status: 'resolved', resolvedAt: new Date() },
    });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tasks/:id/dismiss', async (req, res) => {
  try {
    const task = await prisma.bpoTask.update({
      where: { id: req.params.id },
      data: { status: 'dismissed', resolvedAt: new Date() },
    });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Scan: gera tarefas auto pra todos clientes ===
router.post('/scan', async (req, res) => {
  try {
    const clients = await prisma.client.findMany({ where: { bpoEnabled: true, active: true } });
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 86400000);
    let created = 0;

    for (const c of clients) {
      // 1. Contas vencidas
      const overdue = await prisma.payable.findMany({
        where: { clientId: c.id, dueDate: { lt: now }, status: { in: ['pending', 'paid_partial'] } },
        take: 50,
      });
      for (const p of overdue) {
        const exists = await prisma.bpoTask.findFirst({
          where: { clientId: c.id, type: 'overdue_payable', relatedId: p.id, status: 'open' },
        });
        if (!exists) {
          await prisma.bpoTask.create({
            data: {
              clientId: c.id, type: 'overdue_payable', severity: 'high',
              title: `Conta vencida: ${p.description || p.invoiceNumber || 'sem descrição'}`,
              description: `R$ ${p.remainingAmount} venceu em ${p.dueDate.toISOString().slice(0, 10)}`,
              relatedType: 'payable', relatedId: p.id, dueAt: p.dueDate,
            },
          });
          created++;
        }
      }

      // 2. Transações não conciliadas (mais de 3 dias)
      const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);
      const unconciliated = await prisma.bankTransaction.findMany({
        where: {
          bankAccount: { clientId: c.id },
          reconciledType: null,
          date: { lt: threeDaysAgo },
        },
        take: 20,
      });
      for (const t of unconciliated) {
        const exists = await prisma.bpoTask.findFirst({
          where: { clientId: c.id, type: 'unconciliated_tx', relatedId: t.id, status: 'open' },
        });
        if (!exists) {
          await prisma.bpoTask.create({
            data: {
              clientId: c.id, type: 'unconciliated_tx', severity: 'normal',
              title: `Conciliar: ${t.description.slice(0, 60)}`,
              description: `R$ ${t.amount} de ${t.date.toISOString().slice(0, 10)}`,
              relatedType: 'bank_transaction', relatedId: t.id,
            },
          });
          created++;
        }
      }
    }

    res.json({ scanned: clients.length, tasksCreated: created });
  } catch (err) {
    console.error('[bpo ops-panel scan]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
