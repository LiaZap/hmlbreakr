/**
 * BPO — Relatórios financeiros
 *
 * Endpoints (todos com filtro por período):
 *   GET /:hash/reports/payables          - Contas a pagar (filtros + agrupamento)
 *   GET /:hash/reports/receivables       - Contas a receber
 *   GET /:hash/reports/payables/paid     - Contas pagas
 *   GET /:hash/reports/receivables/received - Contas recebidas
 *   GET /:hash/reports/dre               - Demonstrativo de Resultado por mês
 *   GET /:hash/reports/cashflow          - Fluxo de caixa (realizado + projetado)
 *   GET /:hash/reports/:type/export      - Mesma coisa em Excel
 *
 * Filtros suportados (query params):
 *   from=YYYY-MM-DD, to=YYYY-MM-DD, categoryId, supplierId, status, groupBy=day|week|month
 */

const express = require('express');
const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const { requireBpoClient, requireBpoOperator } = require('./middleware');
const { stripOnbTag } = require('../../services/onboardingSync');

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

router.use(requireBpoOperator);
router.use(requireBpoClient);

// === Helpers ===

const parseDateRange = (req, defaultDays = 30) => {
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - defaultDays * 86400000);
  const to = req.query.to ? new Date(req.query.to) : new Date();
  to.setHours(23, 59, 59, 999);
  return { from, to };
};

const fmtBRL = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '';

// Constrói filtros where pra Payable/Receivable
const buildWhere = (req, type = 'payable') => {
  const { from, to } = parseDateRange(req, 90);
  const where = {
    clientId: req.bpoClient.id,
    dueDate: { gte: from, lte: to },
  };
  if (req.query.status) where.status = req.query.status;
  if (req.query.categoryId) where.categoryId = req.query.categoryId;
  if (type === 'payable' && req.query.supplierId) where.supplierId = req.query.supplierId;
  if (type === 'receivable' && req.query.paymentMethodId) where.paymentMethodId = req.query.paymentMethodId;
  return where;
};

// === 1. RELATÓRIO CONTAS A PAGAR ===
router.get('/payables', async (req, res) => {
  try {
    const where = buildWhere(req, 'payable');
    const items = await prisma.payable.findMany({
      where,
      orderBy: { dueDate: 'asc' },
      include: {
        supplier: { select: { id: true, name: true, cnpj: true } },
        category: { select: { id: true, name: true, dreGroup: true } },
      },
    });
    const summary = items.reduce((acc, p) => {
      acc.total += Number(p.amount);
      acc.remaining += Number(p.remainingAmount);
      acc.paid += Number(p.amount) - Number(p.remainingAmount);
      acc.byStatus[p.status] = (acc.byStatus[p.status] || 0) + Number(p.amount);
      return acc;
    }, { total: 0, remaining: 0, paid: 0, byStatus: {} });

    const cleanItems = items.map((p) => ({ ...p, description: stripOnbTag(p.description) }));
    res.json({ items: cleanItems, summary, count: items.length, ...parseDateRange(req, 90) });
  } catch (err) {
    console.error('[bpo reports payables]', err);
    res.status(500).json({ error: err.message });
  }
});

// === 2. RELATÓRIO CONTAS A RECEBER ===
router.get('/receivables', async (req, res) => {
  try {
    const where = buildWhere(req, 'receivable');
    const items = await prisma.receivable.findMany({
      where,
      orderBy: { dueDate: 'asc' },
      include: {
        paymentMethod: { select: { id: true, name: true, type: true, feePercent: true } },
        category: { select: { id: true, name: true, dreGroup: true } },
      },
    });
    const summary = items.reduce((acc, r) => {
      acc.total += Number(r.amount);
      acc.remaining += Number(r.remainingAmount);
      acc.received += Number(r.amount) - Number(r.remainingAmount);
      acc.byStatus[r.status] = (acc.byStatus[r.status] || 0) + Number(r.amount);
      return acc;
    }, { total: 0, remaining: 0, received: 0, byStatus: {} });

    res.json({ items, summary, count: items.length, ...parseDateRange(req, 90) });
  } catch (err) {
    console.error('[bpo reports receivables]', err);
    res.status(500).json({ error: err.message });
  }
});

// === 3. CONTAS PAGAS / RECEBIDAS (transações) ===
router.get('/transactions', async (req, res) => {
  try {
    const { from, to } = parseDateRange(req, 30);
    const items = await prisma.paymentTransaction.findMany({
      where: {
        paidAt: { gte: from, lte: to },
        OR: [
          { payable: { clientId: req.bpoClient.id } },
          { receivable: { clientId: req.bpoClient.id } },
        ],
      },
      orderBy: { paidAt: 'desc' },
      include: {
        bankAccount: { select: { bankName: true, account: true } },
        payable: { include: { supplier: { select: { name: true } }, category: { select: { name: true } } } },
        receivable: { include: { paymentMethod: { select: { name: true } }, category: { select: { name: true } } } },
      },
    });
    const summary = items.reduce((acc, t) => {
      const amt = Number(t.amount);
      if (t.payableId) acc.outflow += amt;
      else if (t.receivableId) acc.inflow += amt;
      return acc;
    }, { inflow: 0, outflow: 0 });
    summary.net = summary.inflow - summary.outflow;

    res.json({ items, summary, count: items.length, from, to });
  } catch (err) {
    console.error('[bpo reports transactions]', err);
    res.status(500).json({ error: err.message });
  }
});

// === 4. DRE — Demonstrativo de Resultado do período ===
router.get('/dre', async (req, res) => {
  try {
    const { from, to } = parseDateRange(req, 30);

    // Receivables RECEBIDAS no período
    const receivedTxns = await prisma.paymentTransaction.findMany({
      where: {
        paidAt: { gte: from, lte: to },
        receivable: { clientId: req.bpoClient.id },
      },
      include: { receivable: { include: { paymentMethod: true, category: true } } },
    });

    // Payables PAGAS no período
    const paidTxns = await prisma.paymentTransaction.findMany({
      where: {
        paidAt: { gte: from, lte: to },
        payable: { clientId: req.bpoClient.id },
      },
      include: { payable: { include: { category: true } } },
    });

    // Receita bruta
    const receitaBruta = receivedTxns.reduce((s, t) => s + Number(t.amount), 0);

    // Taxas de venda (calculadas a partir do paymentMethod.feePercent)
    let taxasVenda = 0;
    receivedTxns.forEach((t) => {
      const feePct = t.receivable?.paymentMethod?.feePercent;
      if (feePct) taxasVenda += Number(t.amount) * (Number(feePct) / 100);
    });

    // Agrupar despesas por dreGroup
    const despesasPorGrupo = {};
    paidTxns.forEach((t) => {
      const group = t.payable?.category?.dreGroup || 'outros';
      despesasPorGrupo[group] = (despesasPorGrupo[group] || 0) + Number(t.amount);
    });

    const cmv = despesasPorGrupo.cmv || 0;
    const impostos = despesasPorGrupo.imposto || 0;
    const despesasOp = despesasPorGrupo.despesa_op || 0;
    const proLabore = despesasPorGrupo.pro_labore || 0;
    const taxaVendaCat = despesasPorGrupo.taxa_venda || 0; // se cliente lançou cartão como categoria
    const outros = despesasPorGrupo.outros || 0;

    const totalTaxasVenda = taxasVenda + taxaVendaCat;
    const receitaLiquida = receitaBruta - impostos - totalTaxasVenda;
    const margemContribuicao = receitaLiquida - cmv;
    const resultadoOperacional = margemContribuicao - despesasOp - outros;
    const lucroLiquido = resultadoOperacional - proLabore;

    res.json({
      from, to,
      lines: [
        { label: 'Receita Bruta', value: receitaBruta, sign: '+', type: 'header' },
        { label: 'Impostos', value: -impostos, sign: '-', type: 'deduction' },
        { label: 'Taxas de Venda', value: -totalTaxasVenda, sign: '-', type: 'deduction' },
        { label: 'Receita Líquida', value: receitaLiquida, sign: '=', type: 'subtotal' },
        { label: 'CMV', value: -cmv, sign: '-', type: 'deduction' },
        { label: 'Margem de Contribuição', value: margemContribuicao, sign: '=', type: 'subtotal' },
        { label: 'Despesas Operacionais', value: -despesasOp, sign: '-', type: 'deduction' },
        { label: 'Outros', value: -outros, sign: '-', type: 'deduction' },
        { label: 'Resultado Operacional', value: resultadoOperacional, sign: '=', type: 'subtotal' },
        { label: 'Pró-Labore', value: -proLabore, sign: '-', type: 'deduction' },
        { label: 'Lucro Líquido', value: lucroLiquido, sign: '=', type: 'result' },
      ],
      raw: { receitaBruta, impostos, taxasVenda: totalTaxasVenda, receitaLiquida, cmv, margemContribuicao, despesasOp, proLabore, outros, resultadoOperacional, lucroLiquido },
      counts: { received: receivedTxns.length, paid: paidTxns.length },
    });
  } catch (err) {
    console.error('[bpo reports dre]', err);
    res.status(500).json({ error: err.message });
  }
});

// === 5. FLUXO DE CAIXA (realizado + projetado) ===
router.get('/cashflow', async (req, res) => {
  try {
    const { from, to } = parseDateRange(req, 90);
    const groupBy = req.query.groupBy || 'day'; // day | week | month

    // Realizado: PaymentTransactions
    const txns = await prisma.paymentTransaction.findMany({
      where: {
        paidAt: { gte: from, lte: to },
        OR: [
          { payable: { clientId: req.bpoClient.id } },
          { receivable: { clientId: req.bpoClient.id } },
        ],
      },
      orderBy: { paidAt: 'asc' },
      include: { bankAccount: { select: { id: true, bankName: true } } },
    });

    // Projetado: Payables/Receivables PENDENTES
    const futureP = await prisma.payable.findMany({
      where: {
        clientId: req.bpoClient.id,
        dueDate: { gte: from, lte: to },
        status: { in: ['pending', 'scheduled', 'paid_partial'] },
      },
      select: { dueDate: true, remainingAmount: true, supplier: { select: { name: true } } },
    });
    const futureR = await prisma.receivable.findMany({
      where: {
        clientId: req.bpoClient.id,
        dueDate: { gte: from, lte: to },
        status: { in: ['pending', 'received_partial'] },
      },
      select: { dueDate: true, remainingAmount: true, payerName: true },
    });

    // Agrupa por dia/semana/mês
    const groupKey = (date) => {
      const d = new Date(date);
      if (groupBy === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (groupBy === 'week') {
        const start = new Date(d);
        start.setDate(d.getDate() - d.getDay());
        return start.toISOString().slice(0, 10);
      }
      return d.toISOString().slice(0, 10);
    };

    const buckets = new Map();
    const addToBucket = (date, type, amount) => {
      const k = groupKey(date);
      if (!buckets.has(k)) buckets.set(k, { period: k, realInflow: 0, realOutflow: 0, projInflow: 0, projOutflow: 0 });
      const b = buckets.get(k);
      b[type] += Number(amount);
    };

    txns.forEach((t) => addToBucket(t.paidAt, t.payableId ? 'realOutflow' : 'realInflow', t.amount));
    futureP.forEach((p) => addToBucket(p.dueDate, 'projOutflow', p.remainingAmount));
    futureR.forEach((r) => addToBucket(r.dueDate, 'projInflow', r.remainingAmount));

    const series = Array.from(buckets.values()).sort((a, b) => a.period.localeCompare(b.period));

    // Saldo acumulado (assume saldo atual = soma dos bankAccounts)
    const banks = await prisma.bankAccount.findMany({
      where: { clientId: req.bpoClient.id, active: true },
      select: { currentBalance: true },
    });
    const startingBalance = banks.reduce((s, b) => s + Number(b.currentBalance), 0);
    let balance = startingBalance;
    const cumulative = series.map((s) => {
      const dayNet = s.realInflow + s.projInflow - s.realOutflow - s.projOutflow;
      balance += dayNet;
      return { ...s, balance };
    });

    res.json({
      from, to, groupBy,
      startingBalance,
      series: cumulative,
      summary: {
        totalInflow: series.reduce((s, x) => s + x.realInflow + x.projInflow, 0),
        totalOutflow: series.reduce((s, x) => s + x.realOutflow + x.projOutflow, 0),
        finalBalance: balance,
      },
    });
  } catch (err) {
    console.error('[bpo reports cashflow]', err);
    res.status(500).json({ error: err.message });
  }
});

// === EXPORT EXCEL — qualquer relatório ===
router.get('/:type/export', async (req, res) => {
  try {
    const { type } = req.params;
    let data;
    let sheetName;

    if (type === 'payables') {
      const where = buildWhere(req, 'payable');
      const items = await prisma.payable.findMany({
        where,
        orderBy: { dueDate: 'asc' },
        include: { supplier: true, category: true },
      });
      sheetName = 'Contas a Pagar';
      data = items.map((p) => ({
        Vencimento: fmtDate(p.dueDate),
        Fornecedor: p.supplier?.name || '',
        CNPJ: p.supplier?.cnpj || '',
        'Nota Fiscal': p.invoiceNumber || '',
        Descrição: p.description || '',
        Categoria: p.category?.name || '',
        Valor: Number(p.amount),
        Saldo: Number(p.remainingAmount),
        Status: p.status,
      }));
    } else if (type === 'receivables') {
      const where = buildWhere(req, 'receivable');
      const items = await prisma.receivable.findMany({
        where, orderBy: { dueDate: 'asc' },
        include: { paymentMethod: true, category: true },
      });
      sheetName = 'Contas a Receber';
      data = items.map((r) => ({
        Vencimento: fmtDate(r.dueDate),
        Pagador: r.payerName,
        Documento: r.payerDocument || '',
        Descrição: r.description || '',
        Categoria: r.category?.name || '',
        'Forma Pagto': r.paymentMethod?.name || '',
        Valor: Number(r.amount),
        Saldo: Number(r.remainingAmount),
        Status: r.status,
      }));
    } else if (type === 'transactions') {
      const { from, to } = parseDateRange(req, 30);
      const items = await prisma.paymentTransaction.findMany({
        where: {
          paidAt: { gte: from, lte: to },
          OR: [{ payable: { clientId: req.bpoClient.id } }, { receivable: { clientId: req.bpoClient.id } }],
        },
        orderBy: { paidAt: 'desc' },
        include: {
          bankAccount: true,
          payable: { include: { supplier: true } },
          receivable: { include: { paymentMethod: true } },
        },
      });
      sheetName = 'Movimentações';
      data = items.map((t) => ({
        Data: fmtDate(t.paidAt),
        Tipo: t.payableId ? 'Pagamento' : 'Recebimento',
        Origem: t.payable ? t.payable.supplier?.name : t.receivable?.payerName,
        Banco: t.bankAccount?.bankName,
        Conta: t.bankAccount?.account,
        Valor: Number(t.amount),
        Parcial: t.isPartial ? 'Sim' : 'Não',
        Notas: t.notes || '',
      }));
    } else if (type === 'dre') {
      // Reusa a logica do GET /dre via fetch interno seria complicado;
      // re-monta inline (mesma logica). Em refactor futuro, extrair helper.
      const { from, to } = parseDateRange(req, 30);
      const receivedTxns = await prisma.paymentTransaction.findMany({
        where: { paidAt: { gte: from, lte: to }, receivable: { clientId: req.bpoClient.id } },
        include: { receivable: { include: { paymentMethod: true, category: true } } },
      });
      const paidTxns = await prisma.paymentTransaction.findMany({
        where: { paidAt: { gte: from, lte: to }, payable: { clientId: req.bpoClient.id } },
        include: { payable: { include: { category: true } } },
      });
      const receitaBruta = receivedTxns.reduce((s, t) => s + Number(t.amount), 0);
      let taxasVenda = 0;
      receivedTxns.forEach((t) => {
        const feePct = t.receivable?.paymentMethod?.feePercent;
        if (feePct) taxasVenda += Number(t.amount) * (Number(feePct) / 100);
      });
      const despesas = {};
      paidTxns.forEach((t) => {
        const g = t.payable?.category?.dreGroup || 'outros';
        despesas[g] = (despesas[g] || 0) + Number(t.amount);
      });
      const cmv = despesas.cmv || 0;
      const impostos = despesas.imposto || 0;
      const despesasOp = despesas.despesa_op || 0;
      const proLabore = despesas.pro_labore || 0;
      const taxaVendaCat = despesas.taxa_venda || 0;
      const outros = despesas.outros || 0;
      const totalTaxas = taxasVenda + taxaVendaCat;
      const recLiquida = receitaBruta - impostos - totalTaxas;
      const margem = recLiquida - cmv;
      const resultadoOp = margem - despesasOp - outros;
      const lucro = resultadoOp - proLabore;

      sheetName = 'DRE';
      data = [
        { Linha: 'Receita Bruta', Sinal: '+', Valor: receitaBruta },
        { Linha: 'Impostos', Sinal: '-', Valor: -impostos },
        { Linha: 'Taxas de Venda', Sinal: '-', Valor: -totalTaxas },
        { Linha: 'Receita Líquida', Sinal: '=', Valor: recLiquida },
        { Linha: 'CMV', Sinal: '-', Valor: -cmv },
        { Linha: 'Margem de Contribuição', Sinal: '=', Valor: margem },
        { Linha: 'Despesas Operacionais', Sinal: '-', Valor: -despesasOp },
        { Linha: 'Outros', Sinal: '-', Valor: -outros },
        { Linha: 'Resultado Operacional', Sinal: '=', Valor: resultadoOp },
        { Linha: 'Pró-Labore', Sinal: '-', Valor: -proLabore },
        { Linha: 'Lucro Líquido', Sinal: '=', Valor: lucro },
      ];
    } else if (type === 'cashflow') {
      const { from, to } = parseDateRange(req, 90);
      const groupBy = req.query.groupBy || 'day';
      const txns = await prisma.paymentTransaction.findMany({
        where: { paidAt: { gte: from, lte: to }, OR: [{ payable: { clientId: req.bpoClient.id } }, { receivable: { clientId: req.bpoClient.id } }] },
        orderBy: { paidAt: 'asc' },
        include: { bankAccount: { select: { bankName: true } } },
      });
      const futureP = await prisma.payable.findMany({
        where: { clientId: req.bpoClient.id, dueDate: { gte: from, lte: to }, status: { in: ['pending', 'scheduled', 'paid_partial'] } },
        select: { dueDate: true, remainingAmount: true, supplier: { select: { name: true } } },
      });
      const futureR = await prisma.receivable.findMany({
        where: { clientId: req.bpoClient.id, dueDate: { gte: from, lte: to }, status: { in: ['pending', 'received_partial'] } },
        select: { dueDate: true, remainingAmount: true, payerName: true },
      });
      const groupKey = (date) => {
        const d = new Date(date);
        if (groupBy === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (groupBy === 'week') { const s = new Date(d); s.setDate(d.getDate() - d.getDay()); return s.toISOString().slice(0, 10); }
        return d.toISOString().slice(0, 10);
      };
      const buckets = new Map();
      const add = (date, k, v) => { const key = groupKey(date); if (!buckets.has(key)) buckets.set(key, { period: key, realInflow: 0, realOutflow: 0, projInflow: 0, projOutflow: 0 }); buckets.get(key)[k] += Number(v); };
      txns.forEach((t) => add(t.paidAt, t.payableId ? 'realOutflow' : 'realInflow', t.amount));
      futureP.forEach((p) => add(p.dueDate, 'projOutflow', p.remainingAmount));
      futureR.forEach((r) => add(r.dueDate, 'projInflow', r.remainingAmount));
      const banks = await prisma.bankAccount.findMany({ where: { clientId: req.bpoClient.id, active: true }, select: { currentBalance: true } });
      let bal = banks.reduce((s, b) => s + Number(b.currentBalance), 0);
      const series = Array.from(buckets.values()).sort((a, b) => a.period.localeCompare(b.period));

      sheetName = 'Fluxo de Caixa';
      data = series.map((s) => {
        const net = s.realInflow + s.projInflow - s.realOutflow - s.projOutflow;
        bal += net;
        return {
          Período: s.period,
          'Entrada Realizada': s.realInflow,
          'Entrada Projetada': s.projInflow,
          'Saída Realizada': -s.realOutflow,
          'Saída Projetada': -s.projOutflow,
          'Saldo Acumulado': bal,
        };
      });
    } else {
      return res.status(400).json({ error: 'Tipo inválido. Use: payables | receivables | transactions | dre | cashflow' });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${type}_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buf);
  } catch (err) {
    console.error('[bpo reports export]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
