/**
 * BPO — Importações
 *
 * Endpoints:
 *   POST /:clientHash/imports/nfe        - Upload XML de NF-e, parsea e cria Payable
 *   POST /:clientHash/imports/boleto     - Recebe código de barras (47 ou 48 dígitos), parsea e cria Payable
 *   POST /:clientHash/imports/excel      - Bulk import via planilha Excel/CSV
 *   GET  /:clientHash/imports/excel/template/:type - Baixa template Excel pra cada entidade
 *
 * Tudo zero-dependency (parser XML manual, parser boleto via aritmética).
 */

const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const { requireBpoClient, requireBpoOperator } = require('./middleware');

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(requireBpoOperator);
router.use(requireBpoClient);

// ============================================================================
// 1. PARSER NF-e XML — extrai campos críticos sem lib externa
// ============================================================================

/**
 * Extrai um valor entre tags XML usando regex (single-line).
 * Funciona pra <campo>valor</campo>. Não suporta atributos.
 */
const xmlField = (xml, tag) => {
  const re = new RegExp(`<${tag}>([^<]+)</${tag}>`, 'i');
  const match = xml.match(re);
  return match ? match[1].trim() : null;
};

const parseNFe = (xml) => {
  // Remove BOM e normaliza espaços
  const clean = xml.replace(/^﻿/, '').replace(/[\r\n]+/g, ' ');

  // Emitente (fornecedor)
  const emitCnpj = xmlField(clean, 'CNPJ') || xmlField(clean, 'emit><CNPJ');
  const emitName = xmlField(clean, 'xNome') || xmlField(clean, 'xFant');

  // Dados da NF
  const nNF = xmlField(clean, 'nNF');
  const dhEmi = xmlField(clean, 'dhEmi') || xmlField(clean, 'dEmi');
  const vNF = xmlField(clean, 'vNF');
  const vProd = xmlField(clean, 'vProd');
  const natOp = xmlField(clean, 'natOp');

  // Vencimentos (cobrança / duplicatas)
  const duplicataMatches = clean.matchAll(/<dup>[\s\S]*?<dVenc>([^<]+)<\/dVenc>[\s\S]*?<vDup>([^<]+)<\/vDup>[\s\S]*?<\/dup>/gi);
  const installments = [];
  for (const m of duplicataMatches) {
    installments.push({ dueDate: m[1], amount: parseFloat(m[2]) });
  }

  if (!emitCnpj || !vNF) {
    throw new Error('XML inválido: CNPJ do emitente ou vNF não encontrados');
  }

  return {
    supplierCnpj: emitCnpj.replace(/\D/g, ''),
    supplierName: emitName || 'Fornecedor (importado de NF-e)',
    invoiceNumber: nNF,
    emissionDate: dhEmi ? new Date(dhEmi).toISOString() : null,
    amount: parseFloat(vNF),
    productAmount: vProd ? parseFloat(vProd) : null,
    description: natOp || `NF-e ${nNF}`,
    installments, // se vazio, é à vista
  };
};

router.post('/nfe', upload.single('xml'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo XML obrigatório (campo "xml")' });
    const xml = req.file.buffer.toString('utf-8');

    let parsed;
    try {
      parsed = parseNFe(xml);
    } catch (err) {
      return res.status(400).json({ error: `Falha ao parsear XML: ${err.message}` });
    }

    // Modo preview (default): só retorna o parse sem criar
    if (req.query.preview === '1' || req.query.preview === 'true') {
      return res.json({ preview: parsed });
    }

    // Cria/encontra Supplier
    let supplier = await prisma.supplier.findUnique({
      where: { clientId_cnpj: { clientId: req.bpoClient.id, cnpj: parsed.supplierCnpj } },
    });
    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: { clientId: req.bpoClient.id, cnpj: parsed.supplierCnpj, name: parsed.supplierName },
      });
    }

    // Cria Payable (se houver duplicatas, cria parcelas; senão, à vista)
    const baseData = {
      clientId: req.bpoClient.id,
      supplierId: supplier.id,
      invoiceNumber: parsed.invoiceNumber,
      emissionDate: parsed.emissionDate ? new Date(parsed.emissionDate) : null,
      description: parsed.description,
    };

    let created;
    if (parsed.installments.length > 0) {
      // Cria parcela 1 (parent)
      const first = parsed.installments[0];
      const parent = await prisma.payable.create({
        data: {
          ...baseData,
          amount: first.amount,
          remainingAmount: first.amount,
          dueDate: new Date(first.dueDate),
          paymentForecast: new Date(first.dueDate),
          installmentNumber: 1,
          status: 'pending',
        },
      });
      const items = [parent];
      for (let i = 1; i < parsed.installments.length; i++) {
        const inst = parsed.installments[i];
        const item = await prisma.payable.create({
          data: {
            ...baseData,
            amount: inst.amount,
            remainingAmount: inst.amount,
            dueDate: new Date(inst.dueDate),
            paymentForecast: new Date(inst.dueDate),
            parentId: parent.id,
            installmentNumber: i + 1,
            status: 'pending',
          },
        });
        items.push(item);
      }
      created = { type: 'installments', count: items.length, items };
    } else {
      const item = await prisma.payable.create({
        data: {
          ...baseData,
          amount: parsed.amount,
          remainingAmount: parsed.amount,
          dueDate: new Date(),  // à vista — vencimento hoje (ajustável)
          paymentForecast: new Date(),
          status: 'pending',
        },
      });
      created = { type: 'single', items: [item] };
    }

    res.json({ supplier, payable: created, parsed });
  } catch (err) {
    console.error('[bpo imports nfe]', err);
    res.status(500).json({ error: 'Erro ao importar NF-e' });
  }
});

// ============================================================================
// 2. PARSER CÓDIGO DE BARRAS BOLETO
// ============================================================================

/**
 * Aceita linha digitável (47 dígitos) ou código de barras (44 dígitos).
 * Retorna: { dueDate, amount, bankCode }
 *
 * Layout padrão FEBRABAN:
 * - Posições 6-9 do código de 44 dígitos: fator de vencimento (dias desde 07/10/1997)
 * - Posições 10-19: valor (10 dígitos, últimos 2 são centavos)
 * - Posições 1-3: código do banco
 */
const parseBoleto = (input) => {
  const digits = String(input || '').replace(/\D/g, '');
  let barcode44;

  if (digits.length === 44) {
    // Já é código de barras
    barcode44 = digits;
  } else if (digits.length === 47) {
    // Linha digitável → reconstrói código de barras
    // Layout: AAABC.CCCCX DDDDD.DDDDDY EEEEE.EEEEEZ K UUUUVVVVVVVVVV
    // Reconstrução: AAA + B + K + U + V + CCCCC + DDDDDDDDDD + EEEEEEEEEE
    barcode44 =
      digits.substr(0, 4) +    // banco (3) + moeda (1)
      digits.substr(32, 1) +   // dígito verificador geral
      digits.substr(33, 14) +  // fator vencimento (4) + valor (10)
      digits.substr(4, 5) +    // campo livre 1
      digits.substr(10, 10) +  // campo livre 2
      digits.substr(21, 10);   // campo livre 3
  } else if (digits.length === 48) {
    // Linha digitável de convênio (concessionárias)
    // Não calculamos vencimento/valor — formato é diferente
    return {
      bankCode: digits.substr(0, 3),
      barcodeRaw: digits,
      isConcessionaire: true,
      // valor está nas posições 5-15 (geralmente)
      amount: parseInt(digits.substr(4, 11), 10) / 100,
    };
  } else {
    throw new Error(`Tamanho inválido (esperado 44, 47 ou 48 dígitos, recebido ${digits.length})`);
  }

  const bankCode = barcode44.substr(0, 3);
  const fator = parseInt(barcode44.substr(5, 4), 10);
  const valorRaw = parseInt(barcode44.substr(9, 10), 10);
  const amount = valorRaw / 100;

  // Vencimento: base 07/10/1997 + fator dias
  const baseDate = new Date(1997, 9, 7); // mês 9 = outubro (0-indexed)
  const dueDate = new Date(baseDate.getTime() + fator * 24 * 60 * 60 * 1000);

  return {
    barcodeRaw: barcode44,
    bankCode,
    amount,
    dueDate: dueDate.toISOString(),
    fatorVencimento: fator,
  };
};

router.post('/boleto', async (req, res) => {
  try {
    const { code, supplierId, categoryId, description } = req.body;
    if (!code) return res.status(400).json({ error: 'Campo "code" obrigatório (linha digitável ou código de barras)' });

    let parsed;
    try {
      parsed = parseBoleto(code);
    } catch (err) {
      return res.status(400).json({ error: `Falha ao parsear boleto: ${err.message}` });
    }

    if (req.query.preview === '1' || req.query.preview === 'true') {
      return res.json({ preview: parsed });
    }

    if (!parsed.amount || parsed.isConcessionaire) {
      return res.status(400).json({ error: 'Tipo de boleto não suporta criação automática (provavelmente concessionária)', preview: parsed });
    }

    const item = await prisma.payable.create({
      data: {
        clientId: req.bpoClient.id,
        supplierId: supplierId || null,
        categoryId: categoryId || null,
        amount: parsed.amount,
        remainingAmount: parsed.amount,
        dueDate: new Date(parsed.dueDate),
        paymentForecast: new Date(parsed.dueDate),
        description: description || `Boleto ${parsed.bankCode}`,
        status: 'pending',
      },
    });
    res.json({ payable: item, parsed });
  } catch (err) {
    console.error('[bpo imports boleto]', err);
    res.status(500).json({ error: 'Erro ao importar boleto' });
  }
});

// ============================================================================
// 3. IMPORT EXCEL EM MASSA
// ============================================================================

/**
 * Aceita Excel/CSV e cria Payables, Receivables, Suppliers ou Categories em lote.
 * Tipo definido pelo path param :type.
 *
 * Layouts esperados (primeira linha = header):
 *   payables:    fornecedor_cnpj | descricao | valor | vencimento | categoria | nota_fiscal
 *   receivables: pagador | descricao | valor | vencimento | forma_pagto | categoria
 *   suppliers:   cnpj | nome | email | telefone | pix
 *   categories:  nome | tipo (receita|despesa) | grupo_dre
 */
router.post('/excel/:type', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });
    const type = req.params.type;
    const validTypes = ['payables', 'receivables', 'suppliers', 'categories'];
    if (!validTypes.includes(type)) return res.status(400).json({ error: `type inválido. Aceito: ${validTypes.join(', ')}` });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Planilha vazia' });
    }

    // BUG #4 FIX: valida colunas antes de processar
    const REQUIRED_COLS = {
      payables: ['valor', 'vencimento'],
      receivables: ['pagador', 'valor', 'vencimento'],
      suppliers: ['cnpj', 'nome'],
      categories: ['nome', 'tipo'],
    };
    const firstRow = rows[0];
    const cols = Object.keys(firstRow).map((c) => c.toLowerCase());
    const missing = REQUIRED_COLS[type].filter((req) => !cols.includes(req));
    if (missing.length > 0) {
      return res.status(400).json({
        error: `Colunas obrigatórias faltando: ${missing.join(', ')}`,
        expected: REQUIRED_COLS[type],
        found: cols,
        hint: 'Use o template (Baixar Modelo) pra ver os nomes corretos.',
      });
    }

    const created = [];
    const errors = [];

    // Carrega lookup helpers (suppliers, categories) — pra resolver IDs por nome/cnpj
    const [suppliers, categories, paymentMethods] = await Promise.all([
      prisma.supplier.findMany({ where: { clientId: req.bpoClient.id } }),
      prisma.financialCategory.findMany({ where: { clientId: req.bpoClient.id } }),
      prisma.paymentMethod.findMany({ where: { clientId: req.bpoClient.id } }),
    ]);
    const supplierByCnpj = new Map(suppliers.map((s) => [s.cnpj, s.id]));
    const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
    const paymentMethodByName = new Map(paymentMethods.map((p) => [p.name.toLowerCase(), p.id]));

    for (const [idx, row] of rows.entries()) {
      const rowNum = idx + 2; // +1 pelo header, +1 pra base 1
      try {
        if (type === 'suppliers') {
          const cnpj = String(row.cnpj || '').replace(/\D/g, '');
          if (cnpj.length !== 14) throw new Error('CNPJ inválido');
          if (!row.nome) throw new Error('Nome obrigatório');
          const item = await prisma.supplier.upsert({
            where: { clientId_cnpj: { clientId: req.bpoClient.id, cnpj } },
            create: {
              clientId: req.bpoClient.id, cnpj, name: row.nome,
              email: row.email || null, phone: row.telefone || null, pixKey: row.pix || null,
            },
            update: { name: row.nome },
          });
          created.push(item);
        }

        else if (type === 'categories') {
          if (!row.nome || !row.tipo) throw new Error('nome e tipo obrigatórios');
          if (!['receita', 'despesa'].includes(row.tipo)) throw new Error('tipo deve ser receita ou despesa');
          const item = await prisma.financialCategory.create({
            data: {
              clientId: req.bpoClient.id,
              name: String(row.nome).trim(),
              type: row.tipo,
              dreGroup: row.grupo_dre || null,
            },
          });
          created.push(item);
        }

        else if (type === 'payables') {
          if (!row.valor || !row.vencimento) throw new Error('valor e vencimento obrigatórios');
          const cnpj = String(row.fornecedor_cnpj || '').replace(/\D/g, '');
          let supplierId = cnpj ? supplierByCnpj.get(cnpj) : null;
          // Se não achar fornecedor, cria automaticamente
          if (!supplierId && cnpj.length === 14 && row.fornecedor_nome) {
            const newSup = await prisma.supplier.create({
              data: { clientId: req.bpoClient.id, cnpj, name: String(row.fornecedor_nome) },
            });
            supplierId = newSup.id;
            supplierByCnpj.set(cnpj, supplierId);
          }
          const categoryId = row.categoria ? categoryByName.get(String(row.categoria).toLowerCase()) || null : null;
          const amount = parseFloat(String(row.valor).replace(',', '.'));
          const dueDate = row.vencimento instanceof Date ? row.vencimento : new Date(row.vencimento);
          const item = await prisma.payable.create({
            data: {
              clientId: req.bpoClient.id,
              supplierId, categoryId,
              amount, remainingAmount: amount,
              dueDate, paymentForecast: dueDate,
              invoiceNumber: row.nota_fiscal ? String(row.nota_fiscal) : null,
              description: row.descricao || null,
              status: 'pending',
            },
          });
          created.push(item);
        }

        else if (type === 'receivables') {
          if (!row.pagador || !row.valor || !row.vencimento) throw new Error('pagador, valor e vencimento obrigatórios');
          const categoryId = row.categoria ? categoryByName.get(String(row.categoria).toLowerCase()) || null : null;
          const paymentMethodId = row.forma_pagto ? paymentMethodByName.get(String(row.forma_pagto).toLowerCase()) || null : null;
          const amount = parseFloat(String(row.valor).replace(',', '.'));
          const dueDate = row.vencimento instanceof Date ? row.vencimento : new Date(row.vencimento);
          const item = await prisma.receivable.create({
            data: {
              clientId: req.bpoClient.id,
              payerName: String(row.pagador), categoryId, paymentMethodId,
              amount, remainingAmount: amount,
              dueDate, receiptForecast: dueDate,
              description: row.descricao || null,
              status: 'pending',
            },
          });
          created.push(item);
        }
      } catch (err) {
        errors.push({ row: rowNum, error: err.message, data: row });
      }
    }

    res.json({
      type,
      total: rows.length,
      created: created.length,
      errors: errors.length,
      errorDetails: errors.slice(0, 20), // limita pra não estourar response
    });
  } catch (err) {
    console.error('[bpo imports excel]', err);
    res.status(500).json({ error: 'Erro no import: ' + err.message });
  }
});

// Template Excel (download)
router.get('/excel/template/:type', (req, res) => {
  const type = req.params.type;
  const templates = {
    suppliers: {
      headers: ['cnpj', 'nome', 'email', 'telefone', 'pix'],
      example: ['12345678000190', 'Distribuidora Exemplo LTDA', 'contato@ex.com', '(11) 99999-9999', '12345678000190'],
    },
    categories: {
      headers: ['nome', 'tipo', 'grupo_dre'],
      example: ['Aluguel', 'despesa', 'despesa_op'],
      hint: 'tipo: receita | despesa. grupo_dre: cmv | despesa_op | taxa_venda | imposto | pro_labore | receita | outros',
    },
    payables: {
      headers: ['fornecedor_cnpj', 'fornecedor_nome', 'descricao', 'valor', 'vencimento', 'categoria', 'nota_fiscal'],
      example: ['12345678000190', 'Distribuidora Exemplo', 'Aluguel março', 1500, '2026-03-10', 'Aluguel', 'NF-12345'],
      hint: 'vencimento formato AAAA-MM-DD. fornecedor_nome só usado se CNPJ não está cadastrado (cria fornecedor automaticamente).',
    },
    receivables: {
      headers: ['pagador', 'descricao', 'valor', 'vencimento', 'forma_pagto', 'categoria'],
      example: ['iFood', 'Vendas semana 12', 8000, '2026-03-15', 'iFood', 'Vendas Cartão'],
      hint: 'forma_pagto deve estar cadastrada em Meios de Pagamento.',
    },
  };

  if (!templates[type]) return res.status(400).json({ error: 'Tipo inválido' });

  const { headers, example, hint } = templates[type];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  if (hint) {
    XLSX.utils.sheet_add_aoa(ws, [[''], [hint]], { origin: 'A4' });
  }
  XLSX.utils.book_append_sheet(wb, ws, type);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="template_${type}.xlsx"`);
  res.send(buf);
});

module.exports = router;
