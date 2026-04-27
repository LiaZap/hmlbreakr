/**
 * BPO — Cadastro de Contas Bancárias (BankAccount)
 * Suporta cadastro manual (Fase 1) e Open Finance (Fase 3).
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireBpoClient, requireBpoOperator } = require('./middleware');

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

router.use(requireBpoOperator);
router.use(requireBpoClient);

// LIST
router.get('/', async (req, res) => {
  try {
    const items = await prisma.bankAccount.findMany({
      where: { clientId: req.bpoClient.id, active: true },
      orderBy: { bankName: 'asc' },
      include: { _count: { select: { payments: true } } },
    });
    res.json({ items, total: items.length });
  } catch (err) {
    console.error('[bpo banks list]', err);
    res.status(500).json({ error: 'Erro ao listar contas bancárias' });
  }
});

// GET single
router.get('/:id', async (req, res) => {
  try {
    const item = await prisma.bankAccount.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
      include: {
        payments: { take: 20, orderBy: { paidAt: 'desc' } },
      },
    });
    if (!item) return res.status(404).json({ error: 'Conta não encontrada' });
    res.json(item);
  } catch (err) {
    console.error('[bpo banks get]', err);
    res.status(500).json({ error: 'Erro ao buscar conta' });
  }
});

// CREATE
router.post('/', async (req, res) => {
  try {
    const { bankCode, bankName, agency, account, type, currentBalance } = req.body;
    if (!bankCode || !bankName || !agency || !account) {
      return res.status(400).json({ error: 'bankCode, bankName, agency e account são obrigatórios' });
    }
    const item = await prisma.bankAccount.create({
      data: {
        clientId: req.bpoClient.id,
        bankCode: String(bankCode).trim(),
        bankName: String(bankName).trim(),
        agency: String(agency).trim(),
        account: String(account).trim(),
        type: type || 'corrente',
        currentBalance: currentBalance ? parseFloat(currentBalance) : 0,
        isManual: true,
      },
    });
    res.status(201).json(item);
  } catch (err) {
    console.error('[bpo banks create]', err);
    res.status(500).json({ error: 'Erro ao criar conta bancária' });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.bankAccount.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
    if (!existing) return res.status(404).json({ error: 'Conta não encontrada' });

    const { bankCode, bankName, agency, account, type, currentBalance, active } = req.body;
    const item = await prisma.bankAccount.update({
      where: { id: req.params.id },
      data: {
        ...(bankCode !== undefined ? { bankCode: String(bankCode).trim() } : {}),
        ...(bankName !== undefined ? { bankName: String(bankName).trim() } : {}),
        ...(agency !== undefined ? { agency: String(agency).trim() } : {}),
        ...(account !== undefined ? { account: String(account).trim() } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(currentBalance !== undefined ? { currentBalance: parseFloat(currentBalance) || 0 } : {}),
        ...(active !== undefined ? { active: !!active } : {}),
      },
    });
    res.json(item);
  } catch (err) {
    console.error('[bpo banks update]', err);
    res.status(500).json({ error: 'Erro ao atualizar conta' });
  }
});

// DELETE (soft delete: marca active=false se houver transactions)
router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.bankAccount.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
      include: { _count: { select: { payments: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Conta não encontrada' });

    if (existing._count.payments > 0) {
      // Soft delete pra preservar histórico
      await prisma.bankAccount.update({
        where: { id: req.params.id },
        data: { active: false },
      });
      return res.json({ success: true, softDeleted: true });
    }
    await prisma.bankAccount.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('[bpo banks delete]', err);
    res.status(500).json({ error: 'Erro ao excluir conta' });
  }
});

module.exports = router;
