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

// ============================================================================
// IA helper (OpenAI gpt-4o-mini) — opcional, fallback gracioso pra word-match
// ============================================================================
let openaiClient = null;
const getOpenAI = () => {
  if (!process.env.OPENAI_API_KEY) return null;
  if (openaiClient) return openaiClient;
  try {
    const OpenAI = require('openai');
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openaiClient;
  } catch (err) {
    console.warn('[reconciliation] OpenAI SDK indisponível:', err.message);
    return null;
  }
};

/**
 * suggestWithAI — Refina sugestões usando gpt-4o-mini.
 * @param {object} transaction — { description, amount, date, type }
 * @param {Array} candidates  — top-N candidatos do word-match (max 5 ideal)
 * @returns {Promise<{payableId|receivableId, confidence, reason} | null>}
 */
const suggestWithAI = async (transaction, candidates) => {
  const client = getOpenAI();
  if (!client) return null;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const top = candidates.slice(0, 5);
  const candidateLines = top.map((c, i) => {
    const dueDate = c.dueDate ? new Date(c.dueDate).toISOString().slice(0, 10) : '—';
    const name = c.supplierName || c.payerName || 'Sem fornecedor';
    return `${i + 1}. id=${c.id} | nome="${name}" | valor=R$${Number(c.remainingAmount).toFixed(2)} | vencimento=${dueDate} | descricao="${c.description || ''}"`;
  }).join('\n');

  const txDate = transaction.date ? new Date(transaction.date).toISOString().slice(0, 10) : '—';
  const userPrompt = [
    `Transação bancária:`,
    `- descrição: "${transaction.description}"`,
    `- valor: R$${Number(transaction.amount).toFixed(2)}`,
    `- data: ${txDate}`,
    `- tipo: ${transaction.type}`,
    ``,
    `Candidatos (${top.length}):`,
    candidateLines,
    ``,
    `Escolha o MELHOR match e retorne JSON: {"payableId": "<id>", "confidence": 0-100, "reason": "<motivo curto em pt-BR>"}.`,
    `Se nenhum candidato for plausível, retorne {"payableId": null, "confidence": 0, "reason": "<motivo>"}.`,
  ].join('\n');

  try {
    console.log(`[reconciliation] Using OpenAI for ${top.length} candidates`);
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content: 'Você é assistente de conciliação bancária. Recebe descrição de transação bancária e lista de contas a pagar/receber pendentes. Retorne JSON com {payableId, confidence: 0-100, reason}. Considere: similaridade de descrição, fornecedor, valor próximo (margem 5%), data próxima (±3 dias).',
        },
        { role: 'user', content: userPrompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    const chosenId = parsed.payableId || parsed.receivableId || null;
    if (!chosenId) return null;

    const matched = top.find((c) => c.id === chosenId);
    if (!matched) return null;

    return {
      id: matched.id,
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 240) : '',
    };
  } catch (err) {
    console.warn('[reconciliation] OpenAI fallback (word-match):', err.message);
    return null;
  }
};

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

    // Janelas LARGAS pra trazer pool grande, score fino classifica:
    // - Data: ±90 dias antes / ±30 dias depois (pagamento atrasado é comum)
    // - Valor: ±50% (pra pegar parciais e arredondamentos)
    const fromDate = new Date(tx.date.getTime() - 90 * 86400000);
    const toDate = new Date(tx.date.getTime() + 30 * 86400000);
    const amountNum = Number(tx.amount);

    const suggestions = [];
    let aiCandidatePool = [];
    const targetType = tx.type === 'debit' ? 'payable' : 'receivable';
    const txDescLow = tx.description.toLowerCase();

    // Score fino — quanto mais próximo, mais alto. Tudo escalado pra 0-100:
    // base 30 (estar no pool) + valor (até +40) + nome (até +25) + data (até +15) - fora-de-janela
    const computeScore = (remaining, supplierOrPayerName, dueDate, descricao) => {
      let s = 30;
      const remNum = Number(remaining);
      // Valor (peso máximo): exato +40, ±2% +35, ±10% +25, ±25% +10
      if (Math.abs(remNum - amountNum) < 0.01) s += 40;
      else if (Math.abs(remNum - amountNum) / amountNum < 0.02) s += 35;
      else if (Math.abs(remNum - amountNum) / amountNum < 0.10) s += 25;
      else if (Math.abs(remNum - amountNum) / amountNum < 0.25) s += 10;
      // Nome do fornecedor/pagador na descrição da transação
      if (supplierOrPayerName) {
        const name = supplierOrPayerName.toLowerCase();
        const firstWord = name.split(/\s+/)[0];
        if (txDescLow.includes(name)) s += 25;
        else if (firstWord.length >= 3 && txDescLow.includes(firstWord)) s += 20;
      }
      // Descrição do payable/receivable também conta
      if (descricao) {
        const tokens = descricao.toLowerCase().split(/\s+/).filter((t) => t.length >= 4);
        const hits = tokens.filter((t) => txDescLow.includes(t)).length;
        if (hits >= 2) s += 10;
        else if (hits === 1) s += 5;
      }
      // Proximidade de data: ±3 dias +15, ±7 dias +10, ±15 dias +5
      const daysDiff = Math.abs((new Date(dueDate).getTime() - tx.date.getTime()) / 86400000);
      if (daysDiff <= 3) s += 15;
      else if (daysDiff <= 7) s += 10;
      else if (daysDiff <= 15) s += 5;
      return Math.min(100, s);
    };

    // Helper: extrai palavras "úteis" da descrição da transação pra busca textual
    // (ignora tokens curtos, palavras genéricas como "PIX", "TED", "PAGAMENTO", "RECEBIDO")
    const STOPWORDS = new Set(['pix', 'ted', 'doc', 'pagamento', 'recebido', 'enviada', 'recebida', 'cliente', 'compra', 'debito', 'credito', 'avulso', 'tarifa', 'manutencao', 'iof', 'sobre', 'operacoes', 'fornecedor', 'desconhecido', 'seed', 'bpo']);
    const txTokens = txDescLow.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length >= 3 && !STOPWORDS.has(t));

    const seenIds = new Set();

    if (tx.type === 'debit') {
      // Pool 1: valor próximo (±50%) na janela de data
      const includes = {
        supplier: { select: { name: true } },
        recurrence: { select: { occurrencesCount: true } },
      };
      const byValue = await prisma.payable.findMany({
        where: {
          clientId: req.bpoClient.id,
          status: { in: ['pending', 'scheduled', 'paid_partial'] },
          dueDate: { gte: fromDate, lte: toDate },
          remainingAmount: { gte: amountNum * 0.5, lte: amountNum * 1.5 },
        },
        include: includes,
        take: 50,
      });
      // Pool 2: fornecedor cujo nome matcha algum token da descrição da transação
      // (sem filtro de valor — score vai punir se valor distante)
      const byName = txTokens.length > 0 ? await prisma.payable.findMany({
        where: {
          clientId: req.bpoClient.id,
          status: { in: ['pending', 'scheduled', 'paid_partial'] },
          OR: [
            { supplier: { name: { contains: txTokens[0], mode: 'insensitive' } } },
            ...(txTokens[1] ? [{ supplier: { name: { contains: txTokens[1], mode: 'insensitive' } } }] : []),
            { description: { contains: txTokens[0], mode: 'insensitive' } },
          ],
        },
        include: includes,
        take: 30,
      }) : [];

      [...byValue, ...byName].forEach((c) => {
        if (seenIds.has(c.id)) return;
        seenIds.add(c.id);
        const confidence = computeScore(c.remainingAmount, c.supplier?.name, c.dueDate, c.description || '');
        if (confidence < 40) return;
        suggestions.push({
          type: 'payable',
          id: c.id,
          label: `${c.supplier?.name || 'Sem fornecedor'} — R$ ${c.remainingAmount}`,
          confidence,
          // metadados pra UI desambiguar parcelas iguais
          dueDate: c.dueDate,
          remainingAmount: c.remainingAmount,
          description: c.description || null,
          installmentNumber: c.installmentNumber || null,
          totalInstallments: c.recurrence?.occurrencesCount || null,
        });
        aiCandidatePool.push({
          id: c.id, supplierName: c.supplier?.name || null,
          remainingAmount: c.remainingAmount, dueDate: c.dueDate,
          description: c.description || c.notes || '',
        });
      });
    } else {
      const includesR = { recurrence: { select: { occurrencesCount: true } } };
      const byValue = await prisma.receivable.findMany({
        where: {
          clientId: req.bpoClient.id,
          status: { in: ['pending', 'received_partial'] },
          dueDate: { gte: fromDate, lte: toDate },
          remainingAmount: { gte: amountNum * 0.5, lte: amountNum * 1.5 },
        },
        include: includesR,
        take: 50,
      });
      const byName = txTokens.length > 0 ? await prisma.receivable.findMany({
        where: {
          clientId: req.bpoClient.id,
          status: { in: ['pending', 'received_partial'] },
          OR: [
            { payerName: { contains: txTokens[0], mode: 'insensitive' } },
            ...(txTokens[1] ? [{ payerName: { contains: txTokens[1], mode: 'insensitive' } }] : []),
            { description: { contains: txTokens[0], mode: 'insensitive' } },
          ],
        },
        include: includesR,
        take: 30,
      }) : [];

      [...byValue, ...byName].forEach((c) => {
        if (seenIds.has(c.id)) return;
        seenIds.add(c.id);
        const confidence = computeScore(c.remainingAmount, c.payerName, c.dueDate, c.description || '');
        if (confidence < 40) return;
        suggestions.push({
          type: 'receivable',
          id: c.id,
          label: `${c.payerName} — R$ ${c.remainingAmount}`,
          confidence,
          dueDate: c.dueDate,
          remainingAmount: c.remainingAmount,
          description: c.description || null,
          installmentNumber: c.installmentNumber || null,
          totalInstallments: c.recurrence?.occurrencesCount || null,
        });
        aiCandidatePool.push({
          id: c.id, payerName: c.payerName || null,
          remainingAmount: c.remainingAmount, dueDate: c.dueDate,
          description: c.description || c.notes || '',
        });
      });
    }

    // Limita resultado pra evitar lista enorme
    suggestions.splice(10);

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

    // === IA refinement (gpt-4o-mini) ===
    // Aciona quando: tem candidatos, a melhor sugestão tem confiança baixa (sem
    // valor exato) OU múltiplos candidatos empatados perto do topo.
    const top = suggestions[0];
    const hasExactValue = top && top.confidence >= 80;
    const tieAtTop = suggestions.length > 1 && top && (top.confidence - suggestions[1].confidence) < 15;
    const lowConfidence = top && top.confidence < 80;
    const shouldCallAI = process.env.OPENAI_API_KEY
      && suggestions.length > 0
      && (lowConfidence || tieAtTop || !hasExactValue);

    if (shouldCallAI) {
      // Reordena pool pra match a ordem do suggestions (top-N primeiro)
      const orderedPool = suggestions
        .map((s) => aiCandidatePool.find((c) => c.id === s.id))
        .filter(Boolean);
      const aiPick = await suggestWithAI(
        { description: tx.description, amount: tx.amount, date: tx.date, type: tx.type },
        orderedPool,
      );
      if (aiPick) {
        const idx = suggestions.findIndex((s) => s.id === aiPick.id);
        if (idx >= 0) {
          suggestions[idx] = {
            ...suggestions[idx],
            confidence: aiPick.confidence,
            aiSuggested: true,
            aiReason: aiPick.reason,
          };
          // Move pra topo da lista
          const promoted = suggestions.splice(idx, 1)[0];
          suggestions.unshift(promoted);
        }
      }
    }

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
    // BankTransaction não tem clientId direto — valida o tenant pela cadeia
    // bankAccount.clientId (mesmo padrão de /reconcile e /suggest).
    const tx = await prisma.bankTransaction.findFirst({
      where: { id: req.params.transactionId, bankAccount: { clientId: req.bpoClient.id } },
    });
    if (!tx) return res.status(404).json({ error: 'Registro não encontrado' });

    const updated = await prisma.bankTransaction.update({
      where: { id: tx.id },
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
    // Valida o tenant antes (IDOR) e usa soft delete: ReconciliationRule
    // marca inatividade por `active = false`, delete físico é proibido.
    const rule = await prisma.reconciliationRule.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
    if (!rule) return res.status(404).json({ error: 'Registro não encontrado' });

    await prisma.reconciliationRule.update({
      where: { id: rule.id },
      data: { active: false },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
