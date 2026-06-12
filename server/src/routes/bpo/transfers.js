/**
 * BPO — Transferências entre contas bancárias do mesmo cliente
 * Cria 2 PaymentTransactions (saída de uma, entrada na outra) + atualiza saldos.
 */

const express = require('express');
const { db } = require('../../db/client');
const t = require('../../db/schema-bpo');
const { eq, and, sql, getTableColumns } = require('drizzle-orm');
const { alias } = require('drizzle-orm/pg-core');
const crypto = require('crypto');
const { requireBpoClient, requireBpoOperator } = require('./middleware');

const router = express.Router({ mergeParams: true });

router.use(requireBpoOperator);
router.use(requireBpoClient);

router.get('/', async (req, res) => {
  try {
    const fromAccount = alias(t.bankAccount, 'fromAccount');
    const toAccount = alias(t.bankAccount, 'toAccount');
    const items = await db
      .select({
        ...getTableColumns(t.bankTransfer),
        fromAccount: { bankName: fromAccount.bankName, account: fromAccount.account },
        toAccount: { bankName: toAccount.bankName, account: toAccount.account },
      })
      .from(t.bankTransfer)
      .leftJoin(fromAccount, eq(t.bankTransfer.fromAccountId, fromAccount.id))
      .leftJoin(toAccount, eq(t.bankTransfer.toAccountId, toAccount.id))
      .where(eq(t.bankTransfer.clientId, req.bpoClient.id))
      .orderBy(sql`${t.bankTransfer.date} desc`)
      .limit(100);
    res.json({ items, total: items.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { fromAccountId, toAccountId, amount, date, description, fee = 0 } = req.body;

    if (!fromAccountId || !toAccountId || !amount) {
      return res.status(400).json({ error: 'fromAccountId, toAccountId e amount obrigatórios' });
    }
    if (fromAccountId === toAccountId) {
      return res.status(400).json({ error: 'Conta de origem e destino não podem ser iguais' });
    }

    const amountNum = parseFloat(amount);
    const feeNum = parseFloat(fee) || 0;
    if (amountNum <= 0) return res.status(400).json({ error: 'amount deve ser positivo' });

    const [[fromAccount], [toAccount]] = await Promise.all([
      db.select().from(t.bankAccount)
        .where(and(eq(t.bankAccount.id, fromAccountId), eq(t.bankAccount.clientId, req.bpoClient.id)))
        .limit(1),
      db.select().from(t.bankAccount)
        .where(and(eq(t.bankAccount.id, toAccountId), eq(t.bankAccount.clientId, req.bpoClient.id)))
        .limit(1),
    ]);
    if (!fromAccount) return res.status(404).json({ error: 'Conta de origem não encontrada' });
    if (!toAccount) return res.status(404).json({ error: 'Conta de destino não encontrada' });

    const transferDate = date ? new Date(date) : new Date();

    // Transação atômica: cria o BankTransfer + atualiza os saldos
    const result = await db.transaction(async (tx) => {
      const [transfer] = await tx.insert(t.bankTransfer).values({
        id: crypto.randomUUID(),
        clientId: req.bpoClient.id,
        fromAccountId, toAccountId,
        amount: amountNum,
        fee: feeNum,
        date: transferDate.toISOString(),
        description: description?.trim() || `Transferência ${fromAccount.bankName} → ${toAccount.bankName}`,
      }).returning();

      // Atualiza saldos (saída = amount + fee, entrada = amount)
      await tx.update(t.bankAccount)
        .set({ currentBalance: sql`${t.bankAccount.currentBalance} - ${amountNum + feeNum}`, updatedAt: new Date() })
        .where(eq(t.bankAccount.id, fromAccountId));
      await tx.update(t.bankAccount)
        .set({ currentBalance: sql`${t.bankAccount.currentBalance} + ${amountNum}`, updatedAt: new Date() })
        .where(eq(t.bankAccount.id, toAccountId));

      return transfer;
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('[bpo transfers create]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE — desfaz uma transferência.
 *
 * DECISÃO DE ENGENHARIA: BankTransfer é IMUTÁVEL no schema (não tem campo
 * `active` nem `status`). A regra do projeto proíbe delete físico
 * (`prisma.X.delete`) e mudar o schema está fora do escopo desta correção.
 *
 * Solução: em vez de apagar o registro original, registramos um ESTORNO —
 * uma transferência de compensação no sentido inverso. Isso:
 *   - corrige os saldos das contas (efeito líquido zero);
 *   - preserva o histórico completo (original + estorno), respeitando a
 *     imutabilidade do BankTransfer;
 *   - não usa delete físico, cumprindo a regra anti-delete do projeto.
 *
 * O estorno é idempotente: se já existir um estorno para esta transferência
 * (description marcada com o prefixo abaixo), a operação é rejeitada.
 */
const REVERSAL_PREFIX = '[ESTORNO]';

router.delete('/:id', async (req, res) => {
  try {
    const [transfer] = await db.select().from(t.bankTransfer)
      .where(and(eq(t.bankTransfer.id, req.params.id), eq(t.bankTransfer.clientId, req.bpoClient.id)))
      .limit(1);
    if (!transfer) return res.status(404).json({ error: 'Transferência não encontrada' });

    if (transfer.description && transfer.description.startsWith(REVERSAL_PREFIX)) {
      return res.status(409).json({ error: 'Não é possível estornar um lançamento que já é um estorno' });
    }

    // Verifica se já existe estorno para esta transferência (idempotência)
    const [existingReversal] = await db.select().from(t.bankTransfer)
      .where(and(
        eq(t.bankTransfer.clientId, req.bpoClient.id),
        eq(t.bankTransfer.fromAccountId, transfer.toAccountId),
        eq(t.bankTransfer.toAccountId, transfer.fromAccountId),
        sql`${t.bankTransfer.description} LIKE ${`${REVERSAL_PREFIX} ref:${transfer.id}%`}`,
      ))
      .limit(1);
    if (existingReversal) {
      return res.status(409).json({ error: 'Esta transferência já foi estornada', reversalId: existingReversal.id });
    }

    // Estorno atômico: cria transferência inversa + reverte os saldos.
    // amount inverso = amount original; fee = 0 (o estorno não cobra nova taxa).
    const reversal = await db.transaction(async (tx) => {
      const [rev] = await tx.insert(t.bankTransfer).values({
        id: crypto.randomUUID(),
        clientId: req.bpoClient.id,
        fromAccountId: transfer.toAccountId,
        toAccountId: transfer.fromAccountId,
        amount: Number(transfer.amount),
        fee: 0,
        date: new Date().toISOString(),
        description: `${REVERSAL_PREFIX} ref:${transfer.id} — ${transfer.description || 'Transferência'}`,
      }).returning();

      // Reverte os saldos: devolve amount+fee à origem original, debita amount do destino original
      await tx.update(t.bankAccount)
        .set({ currentBalance: sql`${t.bankAccount.currentBalance} + ${Number(transfer.amount) + Number(transfer.fee)}`, updatedAt: new Date() })
        .where(eq(t.bankAccount.id, transfer.fromAccountId));
      await tx.update(t.bankAccount)
        .set({ currentBalance: sql`${t.bankAccount.currentBalance} - ${Number(transfer.amount)}`, updatedAt: new Date() })
        .where(eq(t.bankAccount.id, transfer.toAccountId));

      return rev;
    });

    res.json({ success: true, reversed: true, reversalId: reversal.id });
  } catch (err) {
    console.error('[bpo transfers delete]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
