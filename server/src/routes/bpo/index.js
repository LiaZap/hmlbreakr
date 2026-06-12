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
const { db } = require('../../db/client');
const t = require('../../db/schema-bpo');
const { eq, and, asc } = require('drizzle-orm');

const router = express.Router();

// Auth admin — pra gating de /admin/bpo-clients e /admin/clients/:hash/bpo-toggle
const { requireAdmin } = require('../../middleware/adminAuth');

const suppliersRoutes = require('./suppliers');
const banksRoutes = require('./banks');
const categoriesRoutes = require('./categories');
const employeesRoutes = require('./employees');
const partnersRoutes = require('./partners');
const paymentMethodsRoutes = require('./payment-methods');
const receivableAdvancesRoutes = require('./receivable-advances');
const loansRoutes = require('./loans');
const payablesRoutes = require('./payables');
const receivablesRoutes = require('./receivables');
const importsRoutes = require('./imports');
const reportsRoutes = require('./reports');
const transfersRoutes = require('./transfers');
const reconciliationRoutes = require('./reconciliation');
const opsPanelRoutes = require('./ops-panel');
const tasksRoutes = require('./tasks');
const { webhookRouter, inboxGlobalRouter, inboxRouter } = require('./whatsapp');
const alertsRoutes = require('./alerts');

// Toggle BPO pra um cliente (admin only)
router.post('/admin/clients/:hash/bpo-toggle', requireAdmin, async (req, res) => {
  try {
    const { enabled } = req.body;
    const [client] = await db.select().from(t.client).where(eq(t.client.hash, req.params.hash)).limit(1);
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });

    const [updated] = await db.update(t.client)
      .set({
        bpoEnabled: !!enabled,
        bpoActivatedAt: enabled ? (client.bpoActivatedAt || new Date()) : client.bpoActivatedAt,
        updatedAt: new Date(),
      })
      .where(eq(t.client.id, client.id))
      .returning();
    res.json({ id: updated.id, hash: updated.hash, bpoEnabled: updated.bpoEnabled });
  } catch (err) {
    console.error('[bpo toggle]', err);
    res.status(500).json({ error: 'Erro ao alterar flag BPO' });
  }
});

// Lista clientes com BPO ativo (pra seletor do operador) — admin only
router.get('/admin/bpo-clients', requireAdmin, async (req, res) => {
  try {
    const clients = await db.select({ id: t.client.id, hash: t.client.hash, name: t.client.name, bpoActivatedAt: t.client.bpoActivatedAt })
      .from(t.client)
      .where(and(eq(t.client.bpoEnabled, true), eq(t.client.active, true)))
      .orderBy(asc(t.client.name));
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
router.use('/:clientHash/advances', receivableAdvancesRoutes);
router.use('/:clientHash/loans', loansRoutes);

// Lançamentos
router.use('/:clientHash/payables', payablesRoutes);
router.use('/:clientHash/receivables', receivablesRoutes);

// Fase 2: Importações + Relatórios
router.use('/:clientHash/imports', importsRoutes);
router.use('/:clientHash/reports', reportsRoutes);

// Fase 3 (parcial) + Fase 4
router.use('/:clientHash/transfers', transfersRoutes);
router.use('/:clientHash/reconciliation', reconciliationRoutes);
router.use('/:clientHash/ops-panel', opsPanelRoutes);

// Fase 5 stub: WhatsApp
router.use('/webhook', webhookRouter);                    // público (sem auth)
router.use('/whatsapp', inboxGlobalRouter);               // multi-cliente (auth operador)
router.use('/:clientHash/whatsapp', inboxRouter);         // por cliente (auth)

// Tarefas BPO (multi-cliente)
router.use('/tasks', tasksRoutes);

// Alertas pro Dashboard do dono (counters + top items)
router.use('/:clientHash/alerts', alertsRoutes);

module.exports = router;
