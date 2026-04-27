/**
 * BPO — Cadastro de Fornecedores (Suppliers)
 * CRUD completo. Serve de TEMPLATE pros outros cadastros (BankAccount, Category, Employee, Partner, PaymentMethod).
 *
 * Endpoints:
 *   GET    /bpo/:clientHash/suppliers
 *   GET    /bpo/:clientHash/suppliers/:id
 *   POST   /bpo/:clientHash/suppliers
 *   PUT    /bpo/:clientHash/suppliers/:id
 *   DELETE /bpo/:clientHash/suppliers/:id
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireBpoClient, requireBpoOperator } = require('./middleware');

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

// Aplica middleware em tudo
router.use(requireBpoOperator);
router.use(requireBpoClient);

// Helper: limpa CNPJ pra só dígitos
const cleanCnpj = (cnpj) => String(cnpj || '').replace(/\D/g, '');

// Validação básica de CNPJ (só checa se tem 14 dígitos — validação dígito verificador opcional)
const isValidCnpj = (cnpj) => cleanCnpj(cnpj).length === 14;

// LIST
router.get('/', async (req, res) => {
  try {
    const { search, page = 1, pageSize = 50 } = req.query;
    const where = {
      clientId: req.bpoClient.id,
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { cnpj: { contains: cleanCnpj(search) } },
        ]
      } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: parseInt(pageSize, 10),
        orderBy: { name: 'asc' },
        include: {
          defaultCategory: { select: { id: true, name: true } },
          defaultBankAccount: { select: { id: true, bankName: true, account: true } },
          _count: { select: { payables: true } },
        },
      }),
      prisma.supplier.count({ where }),
    ]);
    res.json({ items, total, page: parseInt(page, 10), pageSize: parseInt(pageSize, 10) });
  } catch (err) {
    console.error('[bpo suppliers list]', err);
    res.status(500).json({ error: 'Erro ao listar fornecedores' });
  }
});

// GET single
router.get('/:id', async (req, res) => {
  try {
    const supplier = await prisma.supplier.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
      include: {
        defaultCategory: true,
        defaultBankAccount: true,
        payables: {
          orderBy: { dueDate: 'desc' },
          take: 10,
          select: { id: true, amount: true, dueDate: true, status: true, invoiceNumber: true },
        },
      },
    });
    if (!supplier) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    res.json(supplier);
  } catch (err) {
    console.error('[bpo suppliers get]', err);
    res.status(500).json({ error: 'Erro ao buscar fornecedor' });
  }
});

// CREATE
router.post('/', async (req, res) => {
  try {
    const { cnpj, name, email, phone, pixKey, bankCode, agency, account, defaultCategoryId, defaultBankAccountId, notes } = req.body;
    if (!name || !cnpj) return res.status(400).json({ error: 'Nome e CNPJ obrigatórios' });
    if (!isValidCnpj(cnpj)) return res.status(400).json({ error: 'CNPJ inválido (precisa ter 14 dígitos)' });

    // Checa duplicidade
    const existing = await prisma.supplier.findUnique({
      where: { clientId_cnpj: { clientId: req.bpoClient.id, cnpj: cleanCnpj(cnpj) } },
    });
    if (existing) return res.status(409).json({ error: 'CNPJ já cadastrado pra este cliente' });

    const supplier = await prisma.supplier.create({
      data: {
        clientId: req.bpoClient.id,
        cnpj: cleanCnpj(cnpj),
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        pixKey: pixKey?.trim() || null,
        bankCode: bankCode || null,
        agency: agency || null,
        account: account || null,
        defaultCategoryId: defaultCategoryId || null,
        defaultBankAccountId: defaultBankAccountId || null,
        notes: notes?.trim() || null,
      },
    });
    res.status(201).json(supplier);
  } catch (err) {
    console.error('[bpo suppliers create]', err);
    res.status(500).json({ error: 'Erro ao criar fornecedor' });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.supplier.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
    if (!existing) return res.status(404).json({ error: 'Fornecedor não encontrado' });

    const { cnpj, name, email, phone, pixKey, bankCode, agency, account, defaultCategoryId, defaultBankAccountId, notes } = req.body;

    // Se mudou CNPJ, valida + checa duplicidade
    if (cnpj && cleanCnpj(cnpj) !== existing.cnpj) {
      if (!isValidCnpj(cnpj)) return res.status(400).json({ error: 'CNPJ inválido' });
      const dup = await prisma.supplier.findUnique({
        where: { clientId_cnpj: { clientId: req.bpoClient.id, cnpj: cleanCnpj(cnpj) } },
      });
      if (dup) return res.status(409).json({ error: 'CNPJ já cadastrado' });
    }

    const supplier = await prisma.supplier.update({
      where: { id: req.params.id },
      data: {
        ...(cnpj !== undefined ? { cnpj: cleanCnpj(cnpj) } : {}),
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(email !== undefined ? { email: email?.trim() || null } : {}),
        ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
        ...(pixKey !== undefined ? { pixKey: pixKey?.trim() || null } : {}),
        ...(bankCode !== undefined ? { bankCode: bankCode || null } : {}),
        ...(agency !== undefined ? { agency: agency || null } : {}),
        ...(account !== undefined ? { account: account || null } : {}),
        ...(defaultCategoryId !== undefined ? { defaultCategoryId: defaultCategoryId || null } : {}),
        ...(defaultBankAccountId !== undefined ? { defaultBankAccountId: defaultBankAccountId || null } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
      },
    });
    res.json(supplier);
  } catch (err) {
    console.error('[bpo suppliers update]', err);
    res.status(500).json({ error: 'Erro ao atualizar fornecedor' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.supplier.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
      include: { _count: { select: { payables: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Fornecedor não encontrado' });

    // Bloqueia se houver payables vinculados (proteção)
    if (existing._count.payables > 0) {
      return res.status(409).json({
        error: `Não é possível excluir: fornecedor tem ${existing._count.payables} conta(s) a pagar vinculada(s)`,
      });
    }

    await prisma.supplier.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('[bpo suppliers delete]', err);
    res.status(500).json({ error: 'Erro ao excluir fornecedor' });
  }
});

module.exports = router;
