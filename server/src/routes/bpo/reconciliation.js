/**
 * BPO — Conciliação Bancária Manual
 *
 * Workflow:
 * 1. Usuário faz upload de extrato (OFX, CSV ou cola transações manuais)
 * 2. Sistema cria BankTransactions
 * 3. Sistema sugere matches (por valor + data + regras de palavra-chave)
 * 4. Usuário confirma ou ajusta o match
 *
 * Hooks pra Open Finance (Pluggy) ficam preparados — só vai precisar de
 * um endpoint /webhook/pluggy quando contratado.
 *
 * Hooks pra IA (gpt-4o-mini) ficam no endpoint /suggest — hoje retorna
 * matches por keyword + valor; quando OpenAI estiver configurado, troca
 * por chamada ao modelo.
 */

const express = require('express');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const { requireBpoClient, requireBpoOperator } = require('./middleware');

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireBpoOperator);
router.use(requireBpoClient);

// ============================================================================
// Parser OFX simples (extrai STMTTRN tags)
// ============================================================================
const parseOFX = (content) => {
  const transactions = [];
  // OFX usa tags SGML — pegamos blocos <STMTTRN>...</STMTTRN>
  const stmtRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  const field = (block, tag) => {
    const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i'));
    return m ? m[1].trim() : null;
  };

  let match;
  while ((match = stmtRegex.exec(content)) !== null) {
    const block = match[1];
    const trnAmt = parseFloat(field(block, 'TRNAMT') || '0');
    const dtPosted = field(block, 'DTPOSTED');
    const memo = field(block, 'MEMO') || field(block, 'NAME') || '';
    const fitId = field(block, 'FITID');
    const trnType = field(block, 'TRNTYPE') || (trnAmt < 0 ? 'DEBIT' : 'CREDIT');

    // dtPosted formato YYYYMMDD ou YYYYMMDDHHMMSS
    let date;
    if (dtPosted) {
      const y = dtPosted.substr(0, 4);
      const m = dtPosted.substr(4, 2);
      const d = dtPosted.substr(6, 2);
      date = new Date(`${y}-${m}-${d}`);
    } else {
      date = new Date();
    }

    transactions.push({
      externalId: fitId,
      amount: Math.abs(trnAmt),
      date: date.toISOString(),
      description: memo,
      type: trnAmt < 0 || trnType === 'DEBIT' ? 'debit' : 'credit',
    });
  }
  return transactions;
};

// Parser CSV simples (header: data,descricao,valor)
const parseCSV = (content) => {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].toLowerCase().split(sep).map((h) => h.trim());
  const idxData = headers.findIndex((h) => h.includes('data') || h.includes('date'));
  const idxDesc = headers.findIndex((h) => h.includes('desc') || h.includes('histor'));
  const idxValor = headers.findIndex((h) => h.includes('valor') || h.includes('amount'));

  return lines.slice(1).map((line) => {
    const cols = line.split(sep);
    const dateStr = cols[idxData]?.trim() || '';
    const desc = cols[idxDesc]?.trim() || '';
    const valorStr = cols[idxValor]?.trim().replace(',', '.').replace('R$', '').trim() || '0';
    const valor = parseFloat(valorStr);
    // Tenta DD/MM/YYYY ou YYYY-MM-DD
    let date;
    if (dateStr.includes('/')) {
      const [d, m, y] = dateStr.split('/');
      date = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
    } else {
      date = new Date(dateStr);
    }
    return {
      externalId: null,
      amount: Math.abs(valor),
      date: date.toISOString(),
      description: desc,
      type: valor < 0 ? 'debit' : 'credit',
    };
  }).filter((t) => t.description && !isNaN(t.amount) && t.amount > 0);
};

// === Upload extrato ===
router.post('/upload/:bankAccountId', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });
    const account = await prisma.bankAccount.findFirst({
      where: { id: req.params.bankAccountId, clientId: req.bpoClient.id },
    });
    if (!account) return res.status(404).json({ error: 'Conta bancária não encontrada' });

    const content = req.file.buffer.toString('utf-8');
    const ext = req.file.originalname.toLowerCase();
    let parsed;
    let source;
    if (ext.endsWith('.ofx') || content.includes('<STMTTRN>')) {
      parsed = parseOFX(content);
      source = 'ofx';
    } else if (ext.endsWith('.csv') || content.includes(',') || content.includes(';')) {
      parsed = parseCSV(content);
      source = 'csv';
    } else {
      return res.status(400).json({ error: 'Formato não suportado. Use OFX ou CSV.' });
    }

    if (parsed.length === 0) return res.status(400).json({ error: 'Nenhuma transação encontrada no arquivo' });

    // Cria BankTransactions (idempotente via externalId quando OFX)
    const created = [];
    for (const t of parsed) {
      // Se tem FITID, evita duplicar
      if (t.externalId) {
        const exists = await prisma.bankTransaction.findFirst({
          where: { bankAccountId: account.id, externalId: t.externalId },
        });
        if (exists) continue;
      }
      const item = await prisma.bankTransaction.create({
        data: {
          bankAccountId: account.id,
          externalId: t.externalId,
          amount: t.amount,
          date: new Date(t.date),
          description: t.description,
          type: t.type,
          source,
        },
      });
      created.push(item);
    }

    res.json({ source, total: parsed.length, created: created.length, duplicates: parsed.length - created.length });
  } catch (err) {
    console.error('[bpo reconciliation upload]', err);
    res.status(500).json({ error: err.message });
  }
});

// === Lista transações pendentes de conciliação ===
router.get('/pending', async (req, res) => {
  try {
    const { bankAccountId } = req.query;
    const where = {
      bankAccount: { clientId: req.bpoClient.id },
      reconciledType: null,
      ...(bankAccountId ? { bankAccountId } : {}),
    };
    const items = await prisma.bankTransaction.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 100,
      include: { bankAccount: { select: { bankName: true, account: true } } },
    });
    res.json({ items, total: items.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Sugestões de match (regras + valor + data) ===
router.get('/suggest/:transactionId', async (req, res) => {
  try {
    const tx = await prisma.bankTransaction.findFirst({
      where: { id: req.params.transactionId, bankAccount: { clientId: req.bpoClient.id } },
    });
    if (!tx) return res.status(404).json({ error: 'Transação não encontrada' });

    // Janela: ±5 dias da data da transação, valor exato
    const fromDate = new Date(tx.date.getTime() - 5 * 86400000);
    const toDate = new Date(tx.date.getTime() + 5 * 86400000);
    const amountNum = Number(tx.amount);

    const suggestions = [];

    if (tx.type === 'debit') {
      // Provavelmente uma conta a pagar
      const candidates = await prisma.payable.findMany({
        where: {
          clientId: req.bpoClient.id,
          status: { in: ['pending', 'scheduled', 'paid_partial'] },
          dueDate: { gte: fromDate, lte: toDate },
          remainingAmount: { gte: amountNum * 0.95, lte: amountNum * 1.05 },
        },
        include: { supplier: { select: { name: true } } },
        take: 10,
      });
      candidates.forEach((c) => {
        let confidence = 50;
        if (Number(c.remainingAmount) === amountNum) confidence += 30;
        if (c.supplier?.name && tx.description.toLowerCase().includes(c.supplier.name.toLowerCase().split(' ')[0])) confidence += 20;
        suggestions.push({ type: 'payable', id: c.id, label: `${c.supplier?.name || 'Sem fornecedor'} — R$ ${c.remainingAmount}`, confidence });
      });
    } else {
      // Crédito = conta a receber
      const candidates = await prisma.receivable.findMany({
        where: {
          clientId: req.bpoClient.id,
          status: { in: ['pending', 'received_partial'] },
          dueDate: { gte: fromDate, lte: toDate },
          remainingAmount: { gte: amountNum * 0.95, lte: amountNum * 1.05 },
        },
        take: 10,
      });
      candidates.forEach((c) => {
        let confidence = 50;
        if (Number(c.remainingAmount) === amountNum) confidence += 30;
        if (c.payerName && tx.description.toLowerCase().includes(c.payerName.toLowerCase().split(' ')[0])) confidence += 20;
        suggestions.push({ type: 'receivable', id: c.id, label: `${c.payerName} — R$ ${c.remainingAmount}`, confidence });
      });
    }

    // Aplica regras de conciliação (palavra-chave)
    const rules = await prisma.reconciliationRule.findMany({
      where: { clientId: req.bpoClient.id, active: true },
    });
    const matchedRules = rules.filter((r) => {
      const desc = tx.description.toLowerCase();
      const kw = r.keyword.toLowerCase();
      if (r.matchType === 'starts') return desc.startsWith(kw);
      if (r.matchType === 'exact') return desc === kw;
      return desc.includes(kw);
    });

    // Ordena por confidence decrescente
    suggestions.sort((a, b) => b.confidence - a.confidence);

    res.json({ transaction: tx, suggestions, matchedRules });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Conciliar (vincular transação a Payable/Receivable) ===
router.post('/:transactionId/reconcile', async (req, res) => {
  try {
    const { type, id, createPayment } = req.body;
    if (!type || !id) return res.status(400).json({ error: 'type e id obrigatórios' });
    if (!['payable', 'receivable', 'transfer', 'manual_ignored'].includes(type)) {
      return res.status(400).json({ error: 'type inválido' });
    }

    const tx = await prisma.bankTransaction.findFirst({
      where: { id: req.params.transactionId, bankAccount: { clientId: req.bpoClient.id } },
    });
    if (!tx) return res.status(404).json({ error: 'Transação não encontrada' });

    // BUG #7 FIX: valida saldo antes de conciliar (evita saldo negativo)
    if (createPayment && (type === 'payable' || type === 'receivable')) {
      const target = type === 'payable'
        ? await prisma.payable.findUnique({ where: { id } })
        : await prisma.receivable.findUnique({ where: { id } });
      if (!target) return res.status(404).json({ error: `${type} não encontrado` });
      const txAmount = Number(tx.amount);
      const remaining = Number(target.remainingAmount);
      const allowOverpay = req.body.allowOverpay === true;
      if (txAmount > remaining + 0.01 && !allowOverpay) {
        return res.status(400).json({
          error: `Valor da transação (R$ ${txAmount.toFixed(2)}) é maior que o saldo (R$ ${remaining.toFixed(2)}).`,
          txAmount, remaining, diff: txAmount - remaining,
          hint: 'Confirme com allowOverpay=true se for intencional.',
        });
      }
    }

    const result = await prisma.$transaction(async (txdb) => {
      // Marca como conciliada
      const updated = await txdb.bankTransaction.update({
        where: { id: tx.id },
        data: { reconciledType: type, reconciledId: id, reconciledAt: new Date() },
      });

      if (createPayment && (type === 'payable' || type === 'receivable')) {
        const paymentData = {
          amount: Number(tx.amount),
          paidAt: tx.date,
          bankAccountId: tx.bankAccountId,
          notes: `Conciliação automática: ${tx.description}`,
        };
        if (type === 'payable') paymentData.payableId = id;
        else paymentData.receivableId = id;
        await txdb.paymentTransaction.create({ data: paymentData });

        if (type === 'payable') {
          const p = await txdb.payable.findUnique({ where: { id } });
          if (p) {
            const newRemaining = Math.max(0, Number(p.remainingAmount) - Number(tx.amount));
            await txdb.payable.update({
              where: { id },
              data: { remainingAmount: newRemaining, status: newRemaining >= 0.01 ? 'paid_partial' : 'paid' },
            });
          }
        } else {
          const r = await txdb.receivable.findUnique({ where: { id } });
          if (r) {
            const newRemaining = Math.max(0, Number(r.remainingAmount) - Number(tx.amount));
            await txdb.receivable.update({
              where: { id },
              data: { remainingAmount: newRemaining, status: newRemaining >= 0.01 ? 'received_partial' : 'received' },
            });
          }
        }
      }

      return updated;
    });

    res.json(result);
  } catch (err) {
    console.error('[bpo reconciliation reconcile]', err);
    res.status(500).json({ error: err.message });
  }
});

// === Desconciliar ===
router.post('/:transactionId/unreconcile', async (req, res) => {
  try {
    const updated = await prisma.bankTransaction.update({
      where: { id: req.params.transactionId },
      data: { reconciledType: null, reconciledId: null, reconciledAt: null },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Regras de conciliação ===
router.get('/rules', async (req, res) => {
  try {
    const items = await prisma.reconciliationRule.findMany({
      where: { clientId: req.bpoClient.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rules', async (req, res) => {
  try {
    const { keyword, matchType, supplierId, payerName, categoryId, bankAccountId } = req.body;
    if (!keyword) return res.status(400).json({ error: 'keyword obrigatório' });
    const item = await prisma.reconciliationRule.create({
      data: {
        clientId: req.bpoClient.id,
        keyword: keyword.trim(),
        matchType: matchType || 'contains',
        supplierId: supplierId || null,
        payerName: payerName || null,
        categoryId: categoryId || null,
        bankAccountId: bankAccountId || null,
      },
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/rules/:id', async (req, res) => {
  try {
    await prisma.reconciliationRule.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
