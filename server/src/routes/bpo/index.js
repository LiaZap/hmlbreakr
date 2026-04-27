/**
 * BPO Financeiro — router root
 * Agrupa todas as rotas BPO em /bpo/:clientHash/*
 *
 * Adicionado em 2026-04-27. Doc: [[Breakr V2.0 - Plano de Acao BPO Financeiro]]
 *
 * Conforme novos cadastros forem implementados, registrar abaixo:
 *   - suppliers ✅ (template completo)
 *   - bank-accounts (próximo)
 *   - categories
 *   - employees
 *   - partners
 *   - payment-methods
 *   - payables
 *   - receivables
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

const suppliersRoutes = require('./suppliers');
const banksRoutes = require('./banks');
const categoriesRoutes = require('./categories');
const employeesRoutes = require('./employees');
const partnersRoutes = require('./partners');
const paymentMethodsRoutes = require('./payment-methods');
const payablesRoutes = require('./payables');
const receivablesRoutes = require('./receivables');
const importsRoutes = require('./imports');
const reportsRoutes = require('./reports');

// Toggle BPO pra um cliente (admin only — TODO: validar role)
router.post('/admin/clients/:hash/bpo-toggle', async (req, res) => {
  try {
    const { enabled } = req.body;
    const client = await prisma.client.findUnique({ where: { hash: req.params.hash } });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });

    const updated = await prisma.client.update({
      where: { id: client.id },
      data: {
        bpoEnabled: !!enabled,
        bpoActivatedAt: enabled ? (client.bpoActivatedAt || new Date()) : client.bpoActivatedAt,
      },
    });
    res.json({ id: updated.id, hash: updated.hash, bpoEnabled: updated.bpoEnabled });
  } catch (err) {
    console.error('[bpo toggle]', err);
    res.status(500).json({ error: 'Erro ao alterar flag BPO' });
  }
});

// Lista clientes com BPO ativo (pra seletor do operador)
router.get('/admin/bpo-clients', async (req, res) => {
  try {
    const clients = await prisma.client.findMany({
      where: { bpoEnabled: true, active: true },
      select: { id: true, hash: true, name: true, bpoActivatedAt: true },
      orderBy: { name: 'asc' },
    });
    res.json(clients);
  } catch (err) {
    console.error('[bpo list clients]', err);
    res.status(500).json({ error: 'Erro ao listar clientes BPO' });
  }
});

// Cadastros (mounted under /bpo/:clientHash/...)
router.use('/:clientHash/suppliers', suppliersRoutes);
router.use('/:clientHash/bank-accounts', banksRoutes);
router.use('/:clientHash/categories', categoriesRoutes);
router.use('/:clientHash/employees', employeesRoutes);
router.use('/:clientHash/partners', partnersRoutes);
router.use('/:clientHash/payment-methods', paymentMethodsRoutes);

// Lançamentos
router.use('/:clientHash/payables', payablesRoutes);
router.use('/:clientHash/receivables', receivablesRoutes);

// Fase 2: Importações + Relatórios
router.use('/:clientHash/imports', importsRoutes);
router.use('/:clientHash/reports', reportsRoutes);

module.exports = router;
