/**
 * BPO — Transferências entre contas bancárias do mesmo cliente
 * Cria 2 PaymentTransactions (saída de uma, entrada na outra) + atualiza saldos.
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireBpoClient, requireBpoOperator } = require('./middleware');

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

router.use(requireBpoOperator);
router.use(requireBpoClient);

router.get('/', async (req, res) => {
  try {
    const items = await prisma.bankTransfer.findMany({
      where: { clientId: req.bpoClient.id },
      orderBy: { date: 'desc' },
      take: 100,
      include: {
        fromAccount: { select: { bankName: true, account: true } },
        toAccount: { select: { bankName: true, account: true } },
      },
    });
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

    const [fromAccount, toAccount] = await Promise.all([
      prisma.bankAccount.findFirst({ where: { id: fromAccountId, clientId: req.bpoClient.id } }),
      prisma.bankAccount.findFirst({ where: { id: toAccountId, clientId: req.bpoClient.id } }),
    ]);
    if (!fromAccount) return res.status(404).json({ error: 'Conta de origem não encontrada' });
    if (!toAccount) return res.status(404).json({ error: 'Conta de destino não encontrada' });

    const transferDate = date ? new Date(date) : new Date();

    // Transação atômica: cria o BankTransfer + atualiza os saldos
    const result = await prisma.$transaction(async (tx) => {
      const transfer = await tx.bankTransfer.create({
        data: {
          clientId: req.bpoClient.id,
          fromAccountId, toAccountId,
          amount: amountNum,
          fee: feeNum,
          date: transferDate,
          description: description?.trim() || `Transferência ${fromAccount.bankName} → ${toAccount.bankName}`,
        },
      });

      // Atualiza saldos (saída = amount + fee, entrada = amount)
      await tx.bankAccount.update({
        where: { id: fromAccountId },
        data: { currentBalance: { decrement: amountNum + feeNum } },
      });
      await tx.bankAccount.update({
        where: { id: toAccountId },
        data: { currentBalance: { increment: amountNum } },
      });

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
    const transfer = await prisma.bankTransfer.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
    if (!transfer) return res.status(404).json({ error: 'Transferência não encontrada' });

    if (transfer.description && transfer.description.startsWith(REVERSAL_PREFIX)) {
      return res.status(409).json({ error: 'Não é possível estornar um lançamento que já é um estorno' });
    }

    // Verifica se já existe estorno para esta transferência (idempotência)
    const existingReversal = await prisma.bankTransfer.findFirst({
      where: {
        clientId: req.bpoClient.id,
        fromAccountId: transfer.toAccountId,
        toAccountId: transfer.fromAccountId,
        description: { startsWith: `${REVERSAL_PREFIX} ref:${transfer.id}` },
      },
    });
    if (existingReversal) {
      return res.status(409).json({ error: 'Esta transferência já foi estornada', reversalId: existingReversal.id });
    }

    // Estorno atômico: cria transferência inversa + reverte os saldos.
    // amount inverso = amount original; fee = 0 (o estorno não cobra nova taxa).
    const reversal = await prisma.$transaction(async (tx) => {
      const rev = await tx.bankTransfer.create({
        data: {
          clientId: req.bpoClient.id,
          fromAccountId: transfer.toAccountId,
          toAccountId: transfer.fromAccountId,
          amount: Number(transfer.amount),
          fee: 0,
          date: new Date(),
          description: `${REVERSAL_PREFIX} ref:${transfer.id} — ${transfer.description || 'Transferência'}`,
        },
      });

      // Reverte os saldos: devolve amount+fee à origem original, debita amount do destino original
      await tx.bankAccount.update({
        where: { id: transfer.fromAccountId },
        data: { currentBalance: { increment: Number(transfer.amount) + Number(transfer.fee) } },
      });
      await tx.bankAccount.update({
        where: { id: transfer.toAccountId },
        data: { currentBalance: { decrement: Number(transfer.amount) } },
      });

      return rev;
    });

    res.json({ success: true, reversed: true, reversalId: reversal.id });
  } catch (err) {
    console.error('[bpo transfers delete]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
