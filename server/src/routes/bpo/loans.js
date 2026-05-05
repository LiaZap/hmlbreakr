/**
 * BAH-031 — Empréstimos e Financiamentos
 *
 * Cliente cadastra contratos com bancos. Sistema calcula via Tabela Price:
 *  - installmentValue = P × i × (1+i)^n / ((1+i)^n − 1)
 *  - totalToPay       = installmentValue × n
 *  - totalInterest    = totalToPay − P
 *  - currentBalance   = saldo devedor amortizado (Price)
 *
 * Endpoints:
 *  GET    /loans          → lista ativos + total currentBalance
 *  POST   /loans          → cria
 *  PUT    /loans/:id      → atualiza (recalcula tudo)
 *  POST   /loans/:id/pay  → marca uma parcela paga (atualiza balance)
 *  DELETE /loans/:id      → soft delete
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireBpoClient, requireBpoOperator } = require('./middleware');

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

router.use(requireBpoOperator);
router.use(requireBpoClient);

// Tabela Price: parcela = P × i × (1+i)^n / ((1+i)^n − 1)
const calcInstallment = (principal, monthlyRatePct, n) => {
  const P = parseFloat(principal);
  const i = parseFloat(monthlyRatePct) / 100;
  const N = parseInt(n, 10);
  if (P <= 0 || N <= 0) return 0;
  if (i === 0) return P / N; // sem juros = parcela linear
  const f = Math.pow(1 + i, N);
  return (P * i * f) / (f - 1);
};

// Saldo devedor após k parcelas pagas (Price)
const calcBalance = (installmentValue, monthlyRatePct, n, paid) => {
  const i = parseFloat(monthlyRatePct) / 100;
  const N = parseInt(n, 10);
  const k = Math.max(0, parseInt(paid, 10));
  const remaining = N - k;
  if (remaining <= 0) return 0;
  if (i === 0) return installmentValue * remaining;
  const f = Math.pow(1 + i, remaining);
  return (installmentValue * (f - 1)) / (i * f);
};

const computeLoan = ({ principal, interestRateMonthly, totalInstallments, paidInstallments }) => {
  const installmentValue = +calcInstallment(principal, interestRateMonthly, totalInstallments).toFixed(2);
  const totalToPay = +(installmentValue * totalInstallments).toFixed(2);
  const totalInterest = +(totalToPay - parseFloat(principal)).toFixed(2);
  const currentBalance = +calcBalance(installmentValue, interestRateMonthly, totalInstallments, paidInstallments || 0).toFixed(2);
  return { installmentValue, totalToPay, totalInterest, currentBalance };
};

router.get('/', async (req, res) => {
  try {
    const items = await prisma.loan.findMany({
      where: { clientId: req.bpoClient.id, active: true },
      orderBy: { createdAt: 'desc' },
    });
    const totalOutstandingBalance = items.reduce((acc, l) => acc + parseFloat(l.currentBalance), 0);
    const totalMonthlyInstallments = items
      .filter(l => l.status === 'active')
      .reduce((acc, l) => acc + parseFloat(l.installmentValue), 0);
    res.json({
      items,
      total: items.length,
      totalOutstandingBalance: +totalOutstandingBalance.toFixed(2),
      totalMonthlyInstallments: +totalMonthlyInstallments.toFixed(2),
    });
  } catch (err) {
    console.error('[bpo loans list]', err);
    res.status(500).json({ error: 'Erro ao listar empréstimos' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { bankName, contractNumber, description, principal, interestRateMonthly, totalInstallments, paidInstallments, startDate, notes } = req.body;
    if (!bankName || !bankName.trim()) return res.status(400).json({ error: 'bankName obrigatório' });
    if (parseFloat(principal) <= 0) return res.status(400).json({ error: 'principal deve ser > 0' });
    if (parseFloat(interestRateMonthly) < 0) return res.status(400).json({ error: 'interestRateMonthly inválido' });
    if (parseInt(totalInstallments, 10) <= 0) return res.status(400).json({ error: 'totalInstallments deve ser > 0' });

    const calc = computeLoan({ principal, interestRateMonthly, totalInstallments, paidInstallments });

    const item = await prisma.loan.create({
      data: {
        clientId: req.bpoClient.id,
        bankName: bankName.trim(),
        contractNumber: contractNumber?.trim() || null,
        description: description?.trim() || null,
        principal: parseFloat(principal),
        interestRateMonthly: parseFloat(interestRateMonthly),
        totalInstallments: parseInt(totalInstallments, 10),
        paidInstallments: parseInt(paidInstallments, 10) || 0,
        startDate: startDate ? new Date(startDate) : new Date(),
        notes: notes?.trim() || null,
        ...calc,
        status: (parseInt(paidInstallments, 10) || 0) >= parseInt(totalInstallments, 10) ? 'paid' : 'active',
      },
    });
    res.status(201).json(item);
  } catch (err) {
    console.error('[bpo loans create]', err);
    res.status(500).json({ error: 'Erro ao criar empréstimo' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.loan.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
    if (!existing) return res.status(404).json({ error: 'Não encontrado' });

    const data = { ...req.body };
    delete data.clientId;
    delete data.id;

    // Se mudou inputs, recalcula tudo
    const principal = data.principal != null ? parseFloat(data.principal) : parseFloat(existing.principal);
    const rate = data.interestRateMonthly != null ? parseFloat(data.interestRateMonthly) : parseFloat(existing.interestRateMonthly);
    const total = data.totalInstallments != null ? parseInt(data.totalInstallments, 10) : existing.totalInstallments;
    const paid = data.paidInstallments != null ? parseInt(data.paidInstallments, 10) : existing.paidInstallments;
    const calc = computeLoan({ principal, interestRateMonthly: rate, totalInstallments: total, paidInstallments: paid });

    const item = await prisma.loan.update({
      where: { id: req.params.id },
      data: {
        ...(data.bankName != null ? { bankName: String(data.bankName).trim() } : {}),
        ...(data.contractNumber !== undefined ? { contractNumber: data.contractNumber?.trim() || null } : {}),
        ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
        ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
        ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
        principal,
        interestRateMonthly: rate,
        totalInstallments: total,
        paidInstallments: paid,
        ...calc,
        status: paid >= total ? 'paid' : (data.status || existing.status),
      },
    });
    res.json(item);
  } catch (err) {
    console.error('[bpo loans update]', err);
    res.status(500).json({ error: 'Erro ao atualizar empréstimo' });
  }
});

// Marca uma parcela paga (incrementa paidInstallments + recalcula balance)
router.post('/:id/pay', async (req, res) => {
  try {
    const existing = await prisma.loan.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
    if (!existing) return res.status(404).json({ error: 'Não encontrado' });
    if (existing.paidInstallments >= existing.totalInstallments) {
      return res.status(400).json({ error: 'Empréstimo já quitado' });
    }
    const newPaid = existing.paidInstallments + 1;
    const calc = computeLoan({
      principal: existing.principal,
      interestRateMonthly: existing.interestRateMonthly,
      totalInstallments: existing.totalInstallments,
      paidInstallments: newPaid,
    });
    const item = await prisma.loan.update({
      where: { id: req.params.id },
      data: {
        paidInstallments: newPaid,
        ...calc,
        status: newPaid >= existing.totalInstallments ? 'paid' : 'active',
      },
    });
    res.json(item);
  } catch (err) {
    console.error('[bpo loans pay]', err);
    res.status(500).json({ error: 'Erro ao registrar pagamento' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.loan.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
    if (!existing) return res.status(404).json({ error: 'Não encontrado' });
    await prisma.loan.update({
      where: { id: req.params.id },
      data: { active: false, status: 'cancelled' },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[bpo loans delete]', err);
    res.status(500).json({ error: 'Erro ao excluir empréstimo' });
  }
});

module.exports = router;
