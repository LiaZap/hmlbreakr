/**
 * BPO — Cadastro de Contas Bancárias (BankAccount)
 * Suporta cadastro manual (Fase 1) e Open Finance (Fase 3).
 */

const express = require('express');
const { db } = require('../../db/client');
const t = require('../../db/schema-bpo');
const { eq, and, desc, count } = require('drizzle-orm');
const crypto = require('crypto');
const { requireBpoClient, requireBpoOperator } = require('./middleware');

const router = express.Router({ mergeParams: true });

router.use(requireBpoOperator);
router.use(requireBpoClient);

// LIST
router.get('/', async (req, res) => {
  try {
    const accounts = await db
      .select()
      .from(t.bankAccount)
      .where(and(eq(t.bankAccount.clientId, req.bpoClient.id), eq(t.bankAccount.active, true)))
      .orderBy(t.bankAccount.bankName);

    // _count: { payments: true } — conta PaymentTransaction por bankAccountId
    const items = await Promise.all(
      accounts.map(async (acc) => {
        const [c] = await db
          .select({ n: count() })
          .from(t.paymentTransaction)
          .where(eq(t.paymentTransaction.bankAccountId, acc.id));
        return { ...acc, _count: { payments: Number(c.n) } };
      })
    );

    res.json({ items, total: items.length });
  } catch (err) {
    console.error('[bpo banks list]', err);
    res.status(500).json({ error: 'Erro ao listar contas bancárias' });
  }
});

// GET single
router.get('/:id', async (req, res) => {
  try {
    const [item] = await db
      .select()
      .from(t.bankAccount)
      .where(and(eq(t.bankAccount.id, req.params.id), eq(t.bankAccount.clientId, req.bpoClient.id)))
      .limit(1);
    if (!item) return res.status(404).json({ error: 'Conta não encontrada' });

    // include: { payments: { take: 20, orderBy: { paidAt: 'desc' } } }
    const payments = await db
      .select()
      .from(t.paymentTransaction)
      .where(eq(t.paymentTransaction.bankAccountId, item.id))
      .orderBy(desc(t.paymentTransaction.paidAt))
      .limit(20);

    res.json({ ...item, payments });
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
    const [item] = await db
      .insert(t.bankAccount)
      .values({
        id: crypto.randomUUID(),
        clientId: req.bpoClient.id,
        bankCode: String(bankCode).trim(),
        bankName: String(bankName).trim(),
        agency: String(agency).trim(),
        account: String(account).trim(),
        type: type || 'corrente',
        currentBalance: currentBalance ? parseFloat(currentBalance) : 0,
        isManual: true,
        updatedAt: new Date(),
      })
      .returning();
    res.status(201).json(item);
  } catch (err) {
    console.error('[bpo banks create]', err);
    res.status(500).json({ error: 'Erro ao criar conta bancária' });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const [existing] = await db
      .select()
      .from(t.bankAccount)
      .where(and(eq(t.bankAccount.id, req.params.id), eq(t.bankAccount.clientId, req.bpoClient.id)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Conta não encontrada' });

    const { bankCode, bankName, agency, account, type, currentBalance, active } = req.body;
    const [item] = await db
      .update(t.bankAccount)
      .set({
        ...(bankCode !== undefined ? { bankCode: String(bankCode).trim() } : {}),
        ...(bankName !== undefined ? { bankName: String(bankName).trim() } : {}),
        ...(agency !== undefined ? { agency: String(agency).trim() } : {}),
        ...(account !== undefined ? { account: String(account).trim() } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(currentBalance !== undefined ? { currentBalance: parseFloat(currentBalance) || 0 } : {}),
        ...(active !== undefined ? { active: !!active } : {}),
        updatedAt: new Date(),
      })
      .where(eq(t.bankAccount.id, req.params.id))
      .returning();
    res.json(item);
  } catch (err) {
    console.error('[bpo banks update]', err);
    res.status(500).json({ error: 'Erro ao atualizar conta' });
  }
});

// DELETE (soft delete: regra do projeto — delete físico é proibido)
router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await db
      .select()
      .from(t.bankAccount)
      .where(and(eq(t.bankAccount.id, req.params.id), eq(t.bankAccount.clientId, req.bpoClient.id)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Conta não encontrada' });

    // Soft delete sempre — marca active=false, preserva histórico e FKs
    await db
      .update(t.bankAccount)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(t.bankAccount.id, req.params.id));
    res.json({ success: true, softDeleted: true });
  } catch (err) {
    console.error('[bpo banks delete]', err);
    res.status(500).json({ error: 'Erro ao excluir conta' });
  }
});

module.exports = router;
