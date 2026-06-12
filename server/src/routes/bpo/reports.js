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
const { db } = require('../../db/client');
const t = require('../../db/schema-bpo');
const {
  eq, and, or, ne, gt, gte, lt, lte, inArray, notInArray,
  isNull, isNotNull, desc, asc, sql, count, getTableColumns,
} = require('drizzle-orm');
const { alias } = require('drizzle-orm/pg-core');
const { requireBpoClient, requireBpoOperator } = require('./middleware');
const { stripOnbTag } = require('../../services/onboardingSync');

const router = express.Router({ mergeParams: true });

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

// Constrói filtros where (array de condições Drizzle) pra Payable/Receivable
// timestamp colunas usam mode:'string' — comparamos com ISO string das datas
const buildWhere = (req, type = 'payable') => {
  const { from, to } = parseDateRange(req, 90);
  const tbl = type === 'receivable' ? t.receivable : t.payable;
  const conds = [
    eq(tbl.clientId, req.bpoClient.id),
    gte(tbl.dueDate, from.toISOString()),
    lte(tbl.dueDate, to.toISOString()),
  ];
  if (req.query.status) conds.push(eq(tbl.status, req.query.status));
  if (req.query.categoryId) conds.push(eq(tbl.categoryId, req.query.categoryId));
  if (type === 'payable' && req.query.supplierId) conds.push(eq(tbl.supplierId, req.query.supplierId));
  if (type === 'receivable' && req.query.paymentMethodId) conds.push(eq(tbl.paymentMethodId, req.query.paymentMethodId));
  return conds;
};

// === 1. RELATÓRIO CONTAS A PAGAR ===
router.get('/payables', async (req, res) => {
  try {
    const conds = buildWhere(req, 'payable');
    const items = await db.select({
      ...getTableColumns(t.payable),
      supplier: { id: t.supplier.id, name: t.supplier.name, cnpj: t.supplier.cnpj },
      category: { id: t.financialCategory.id, name: t.financialCategory.name, dreGroup: t.financialCategory.dreGroup },
    }).from(t.payable)
      .leftJoin(t.supplier, eq(t.payable.supplierId, t.supplier.id))
      .leftJoin(t.financialCategory, eq(t.payable.categoryId, t.financialCategory.id))
      .where(and(...conds))
      .orderBy(asc(t.payable.dueDate));
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
    const conds = buildWhere(req, 'receivable');
    const items = await db.select({
      ...getTableColumns(t.receivable),
      paymentMethod: { id: t.paymentMethod.id, name: t.paymentMethod.name, type: t.paymentMethod.type, feePercent: t.paymentMethod.feePercent },
      category: { id: t.financialCategory.id, name: t.financialCategory.name, dreGroup: t.financialCategory.dreGroup },
    }).from(t.receivable)
      .leftJoin(t.paymentMethod, eq(t.receivable.paymentMethodId, t.paymentMethod.id))
      .leftJoin(t.financialCategory, eq(t.receivable.categoryId, t.financialCategory.id))
      .where(and(...conds))
      .orderBy(asc(t.receivable.dueDate));
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
    const payCat = alias(t.financialCategory, 'payCat');
    const recCat = alias(t.financialCategory, 'recCat');
    const rows = await db.select({
      ...getTableColumns(t.paymentTransaction),
      bankAccount: { bankName: t.bankAccount.bankName, account: t.bankAccount.account },
      payable: getTableColumns(t.payable),
      payableSupplierName: t.supplier.name,
      payableCategoryName: payCat.name,
      receivable: getTableColumns(t.receivable),
      receivablePaymentMethodName: t.paymentMethod.name,
      receivableCategoryName: recCat.name,
    }).from(t.paymentTransaction)
      .leftJoin(t.bankAccount, eq(t.paymentTransaction.bankAccountId, t.bankAccount.id))
      .leftJoin(t.payable, eq(t.paymentTransaction.payableId, t.payable.id))
      .leftJoin(t.supplier, eq(t.payable.supplierId, t.supplier.id))
      .leftJoin(payCat, eq(t.payable.categoryId, payCat.id))
      .leftJoin(t.receivable, eq(t.paymentTransaction.receivableId, t.receivable.id))
      .leftJoin(t.paymentMethod, eq(t.receivable.paymentMethodId, t.paymentMethod.id))
      .leftJoin(recCat, eq(t.receivable.categoryId, recCat.id))
      .where(and(
        gte(t.paymentTransaction.paidAt, from.toISOString()),
        lte(t.paymentTransaction.paidAt, to.toISOString()),
        or(eq(t.payable.clientId, req.bpoClient.id), eq(t.receivable.clientId, req.bpoClient.id)),
      ))
      .orderBy(desc(t.paymentTransaction.paidAt));
    // Reconstrói a forma aninhada que o include do Prisma retornava
    const items = rows.map((row) => {
      const { payable, payableSupplierName, payableCategoryName, receivable, receivablePaymentMethodName, receivableCategoryName, ...txn } = row;
      return {
        ...txn,
        payable: row.payableId ? { ...payable, supplier: payableSupplierName != null ? { name: payableSupplierName } : null, category: payableCategoryName != null ? { name: payableCategoryName } : null } : null,
        receivable: row.receivableId ? { ...receivable, paymentMethod: receivablePaymentMethodName != null ? { name: receivablePaymentMethodName } : null, category: receivableCategoryName != null ? { name: receivableCategoryName } : null } : null,
      };
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
    const receivedTxns = await db.select({
      amount: t.paymentTransaction.amount,
      feePercent: t.paymentMethod.feePercent,
    }).from(t.paymentTransaction)
      .innerJoin(t.receivable, eq(t.paymentTransaction.receivableId, t.receivable.id))
      .leftJoin(t.paymentMethod, eq(t.receivable.paymentMethodId, t.paymentMethod.id))
      .where(and(
        gte(t.paymentTransaction.paidAt, from.toISOString()),
        lte(t.paymentTransaction.paidAt, to.toISOString()),
        eq(t.receivable.clientId, req.bpoClient.id),
      ));

    // Payables PAGAS no período
    const paidTxns = await db.select({
      amount: t.paymentTransaction.amount,
      dreGroup: t.financialCategory.dreGroup,
    }).from(t.paymentTransaction)
      .innerJoin(t.payable, eq(t.paymentTransaction.payableId, t.payable.id))
      .leftJoin(t.financialCategory, eq(t.payable.categoryId, t.financialCategory.id))
      .where(and(
        gte(t.paymentTransaction.paidAt, from.toISOString()),
        lte(t.paymentTransaction.paidAt, to.toISOString()),
        eq(t.payable.clientId, req.bpoClient.id),
      ));

    // Receita bruta
    const receitaBruta = receivedTxns.reduce((s, t) => s + Number(t.amount), 0);

    // Taxas de venda (calculadas a partir do paymentMethod.feePercent)
    let taxasVenda = 0;
    receivedTxns.forEach((t) => {
      const feePct = t.feePercent;
      if (feePct) taxasVenda += Number(t.amount) * (Number(feePct) / 100);
    });

    // Agrupar despesas por dreGroup
    const despesasPorGrupo = {};
    paidTxns.forEach((t) => {
      const group = t.dreGroup || 'outros';
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
    const txns = await db.select({
      paidAt: t.paymentTransaction.paidAt,
      payableId: t.paymentTransaction.payableId,
      amount: t.paymentTransaction.amount,
      bankAccount: { id: t.bankAccount.id, bankName: t.bankAccount.bankName },
    }).from(t.paymentTransaction)
      .leftJoin(t.bankAccount, eq(t.paymentTransaction.bankAccountId, t.bankAccount.id))
      .leftJoin(t.payable, eq(t.paymentTransaction.payableId, t.payable.id))
      .leftJoin(t.receivable, eq(t.paymentTransaction.receivableId, t.receivable.id))
      .where(and(
        gte(t.paymentTransaction.paidAt, from.toISOString()),
        lte(t.paymentTransaction.paidAt, to.toISOString()),
        or(eq(t.payable.clientId, req.bpoClient.id), eq(t.receivable.clientId, req.bpoClient.id)),
      ))
      .orderBy(asc(t.paymentTransaction.paidAt));

    // Projetado: Payables/Receivables PENDENTES
    const futureP = await db.select({
      dueDate: t.payable.dueDate,
      remainingAmount: t.payable.remainingAmount,
      supplier: { name: t.supplier.name },
    }).from(t.payable)
      .leftJoin(t.supplier, eq(t.payable.supplierId, t.supplier.id))
      .where(and(
        eq(t.payable.clientId, req.bpoClient.id),
        gte(t.payable.dueDate, from.toISOString()),
        lte(t.payable.dueDate, to.toISOString()),
        inArray(t.payable.status, ['pending', 'scheduled', 'paid_partial']),
      ));
    const futureR = await db.select({
      dueDate: t.receivable.dueDate,
      remainingAmount: t.receivable.remainingAmount,
      payerName: t.receivable.payerName,
    }).from(t.receivable)
      .where(and(
        eq(t.receivable.clientId, req.bpoClient.id),
        gte(t.receivable.dueDate, from.toISOString()),
        lte(t.receivable.dueDate, to.toISOString()),
        inArray(t.receivable.status, ['pending', 'received_partial']),
      ));

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
    const banks = await db.select({ currentBalance: t.bankAccount.currentBalance })
      .from(t.bankAccount)
      .where(and(eq(t.bankAccount.clientId, req.bpoClient.id), eq(t.bankAccount.active, true)));
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
      const conds = buildWhere(req, 'payable');
      const items = await db.select({
        ...getTableColumns(t.payable),
        supplier: getTableColumns(t.supplier),
        category: getTableColumns(t.financialCategory),
      }).from(t.payable)
        .leftJoin(t.supplier, eq(t.payable.supplierId, t.supplier.id))
        .leftJoin(t.financialCategory, eq(t.payable.categoryId, t.financialCategory.id))
        .where(and(...conds))
        .orderBy(asc(t.payable.dueDate));
      sheetName = 'Contas a Pagar';
      data = items.map((p) => ({
        Vencimento: fmtDate(p.dueDate),
        Fornecedor: p.supplier?.name || '',
        CNPJ: p.supplier?.cnpj || '',
        'Nota Fiscal': p.invoiceNumber || '',
        Descrição: stripOnbTag(p.description) || '',
        Categoria: p.category?.name || '',
        Valor: Number(p.amount),
        Saldo: Number(p.remainingAmount),
        Status: p.status,
      }));
    } else if (type === 'receivables') {
      const conds = buildWhere(req, 'receivable');
      const items = await db.select({
        ...getTableColumns(t.receivable),
        paymentMethod: getTableColumns(t.paymentMethod),
        category: getTableColumns(t.financialCategory),
      }).from(t.receivable)
        .leftJoin(t.paymentMethod, eq(t.receivable.paymentMethodId, t.paymentMethod.id))
        .leftJoin(t.financialCategory, eq(t.receivable.categoryId, t.financialCategory.id))
        .where(and(...conds))
        .orderBy(asc(t.receivable.dueDate));
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
      const rows = await db.select({
        ...getTableColumns(t.paymentTransaction),
        bankAccount: getTableColumns(t.bankAccount),
        payable: getTableColumns(t.payable),
        payableSupplier: getTableColumns(t.supplier),
        receivable: getTableColumns(t.receivable),
        receivablePaymentMethod: getTableColumns(t.paymentMethod),
      }).from(t.paymentTransaction)
        .leftJoin(t.bankAccount, eq(t.paymentTransaction.bankAccountId, t.bankAccount.id))
        .leftJoin(t.payable, eq(t.paymentTransaction.payableId, t.payable.id))
        .leftJoin(t.supplier, eq(t.payable.supplierId, t.supplier.id))
        .leftJoin(t.receivable, eq(t.paymentTransaction.receivableId, t.receivable.id))
        .leftJoin(t.paymentMethod, eq(t.receivable.paymentMethodId, t.paymentMethod.id))
        .where(and(
          gte(t.paymentTransaction.paidAt, from.toISOString()),
          lte(t.paymentTransaction.paidAt, to.toISOString()),
          or(eq(t.payable.clientId, req.bpoClient.id), eq(t.receivable.clientId, req.bpoClient.id)),
        ))
        .orderBy(desc(t.paymentTransaction.paidAt));
      const items = rows.map((row) => {
        const { payableSupplier, receivablePaymentMethod, ...rest } = row;
        return {
          ...rest,
          payable: row.payableId ? { ...row.payable, supplier: payableSupplier && payableSupplier.id != null ? payableSupplier : null } : null,
          receivable: row.receivableId ? { ...row.receivable, paymentMethod: receivablePaymentMethod && receivablePaymentMethod.id != null ? receivablePaymentMethod : null } : null,
        };
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
      const receivedTxns = await db.select({
        amount: t.paymentTransaction.amount,
        feePercent: t.paymentMethod.feePercent,
      }).from(t.paymentTransaction)
        .innerJoin(t.receivable, eq(t.paymentTransaction.receivableId, t.receivable.id))
        .leftJoin(t.paymentMethod, eq(t.receivable.paymentMethodId, t.paymentMethod.id))
        .where(and(
          gte(t.paymentTransaction.paidAt, from.toISOString()),
          lte(t.paymentTransaction.paidAt, to.toISOString()),
          eq(t.receivable.clientId, req.bpoClient.id),
        ));
      const paidTxns = await db.select({
        amount: t.paymentTransaction.amount,
        dreGroup: t.financialCategory.dreGroup,
      }).from(t.paymentTransaction)
        .innerJoin(t.payable, eq(t.paymentTransaction.payableId, t.payable.id))
        .leftJoin(t.financialCategory, eq(t.payable.categoryId, t.financialCategory.id))
        .where(and(
          gte(t.paymentTransaction.paidAt, from.toISOString()),
          lte(t.paymentTransaction.paidAt, to.toISOString()),
          eq(t.payable.clientId, req.bpoClient.id),
        ));
      const receitaBruta = receivedTxns.reduce((s, t) => s + Number(t.amount), 0);
      let taxasVenda = 0;
      receivedTxns.forEach((t) => {
        const feePct = t.feePercent;
        if (feePct) taxasVenda += Number(t.amount) * (Number(feePct) / 100);
      });
      const despesas = {};
      paidTxns.forEach((t) => {
        const g = t.dreGroup || 'outros';
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
      const txns = await db.select({
        paidAt: t.paymentTransaction.paidAt,
        payableId: t.paymentTransaction.payableId,
        amount: t.paymentTransaction.amount,
        bankAccount: { bankName: t.bankAccount.bankName },
      }).from(t.paymentTransaction)
        .leftJoin(t.bankAccount, eq(t.paymentTransaction.bankAccountId, t.bankAccount.id))
        .leftJoin(t.payable, eq(t.paymentTransaction.payableId, t.payable.id))
        .leftJoin(t.receivable, eq(t.paymentTransaction.receivableId, t.receivable.id))
        .where(and(
          gte(t.paymentTransaction.paidAt, from.toISOString()),
          lte(t.paymentTransaction.paidAt, to.toISOString()),
          or(eq(t.payable.clientId, req.bpoClient.id), eq(t.receivable.clientId, req.bpoClient.id)),
        ))
        .orderBy(asc(t.paymentTransaction.paidAt));
      const futureP = await db.select({
        dueDate: t.payable.dueDate,
        remainingAmount: t.payable.remainingAmount,
        supplier: { name: t.supplier.name },
      }).from(t.payable)
        .leftJoin(t.supplier, eq(t.payable.supplierId, t.supplier.id))
        .where(and(
          eq(t.payable.clientId, req.bpoClient.id),
          gte(t.payable.dueDate, from.toISOString()),
          lte(t.payable.dueDate, to.toISOString()),
          inArray(t.payable.status, ['pending', 'scheduled', 'paid_partial']),
        ));
      const futureR = await db.select({
        dueDate: t.receivable.dueDate,
        remainingAmount: t.receivable.remainingAmount,
        payerName: t.receivable.payerName,
      }).from(t.receivable)
        .where(and(
          eq(t.receivable.clientId, req.bpoClient.id),
          gte(t.receivable.dueDate, from.toISOString()),
          lte(t.receivable.dueDate, to.toISOString()),
          inArray(t.receivable.status, ['pending', 'received_partial']),
        ));
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
      const banks = await db.select({ currentBalance: t.bankAccount.currentBalance })
        .from(t.bankAccount)
        .where(and(eq(t.bankAccount.clientId, req.bpoClient.id), eq(t.bankAccount.active, true)));
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
