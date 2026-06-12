/**
 * BPO — Cadastro de Fornecedores (Suppliers)
 * CRUD completo. Serve de TEMPLATE pros outros cadastros (BankAccount, Category, Employee, Partner, PaymentMethod).
 *
 * Endpoints:
 *   GET    /bpo/:clientHash/suppliers
 *   GET    /bpo/:clientHash/suppliers/:id
 *   POST   /bpo/:clientHash/suppliers
 *   PUT    /bpo/:clientHash/suppliers/:id
 *   DELETE /bpo/:clientHash/suppliers/:id
 */

const express = require('express');
const { db } = require('../../db/client');
const t = require('../../db/schema-bpo');
const { eq, and, or, ne, gt, gte, lt, lte, inArray, notInArray, isNull, isNotNull, desc, asc, sql, count, getTableColumns } = require('drizzle-orm');
const crypto = require('crypto');
const { requireBpoClient, requireBpoOperator } = require('./middleware');

const router = express.Router({ mergeParams: true });

// Aplica middleware em tudo
router.use(requireBpoOperator);
router.use(requireBpoClient);

// Helper: limpa CNPJ pra só dígitos
const cleanCnpj = (cnpj) => String(cnpj || '').replace(/\D/g, '');

// Validação básica de CNPJ (só checa se tem 14 dígitos — validação dígito verificador opcional)
const isValidCnpj = (cnpj) => cleanCnpj(cnpj).length === 14;

// LIST
router.get('/', async (req, res) => {
  try {
    const { search, page = 1, pageSize = 50, includeInactive } = req.query;
    const conditions = [eq(t.supplier.clientId, req.bpoClient.id)];
    // Soft delete: oculta inativos por padrão (sobrepor com ?includeInactive=true)
    if (includeInactive !== 'true') conditions.push(eq(t.supplier.active, true));
    if (search) {
      conditions.push(or(
        sql`${t.supplier.name} ILIKE ${'%' + search + '%'}`,
        sql`${t.supplier.cnpj} ILIKE ${'%' + cleanCnpj(search) + '%'}`,
      ));
    }
    const where = and(...conditions);

    const take = parseInt(pageSize, 10);
    const skip = (page - 1) * pageSize;

    const [rows, [totalRow]] = await Promise.all([
      db.select({
        ...getTableColumns(t.supplier),
        defaultCategory: { id: t.financialCategory.id, name: t.financialCategory.name },
        defaultBankAccount: { id: t.bankAccount.id, bankName: t.bankAccount.bankName, account: t.bankAccount.account },
      })
        .from(t.supplier)
        .leftJoin(t.financialCategory, eq(t.supplier.defaultCategoryId, t.financialCategory.id))
        .leftJoin(t.bankAccount, eq(t.supplier.defaultBankAccountId, t.bankAccount.id))
        .where(where)
        .orderBy(asc(t.supplier.name))
        .limit(take)
        .offset(skip),
      db.select({ n: count() }).from(t.supplier).where(where),
    ]);

    // _count: { payables: true } — contagem de payables por fornecedor
    const items = await Promise.all(rows.map(async (row) => {
      const [payCount] = await db.select({ n: count() })
        .from(t.payable)
        .where(eq(t.payable.supplierId, row.id));
      return { ...row, _count: { payables: payCount.n } };
    }));

    res.json({ items, total: totalRow.n, page: parseInt(page, 10), pageSize: parseInt(pageSize, 10) });
  } catch (err) {
    console.error('[bpo suppliers list]', err);
    res.status(500).json({ error: 'Erro ao listar fornecedores' });
  }
});

// GET single
router.get('/:id', async (req, res) => {
  try {
    const [supplier] = await db.select()
      .from(t.supplier)
      .where(and(eq(t.supplier.id, req.params.id), eq(t.supplier.clientId, req.bpoClient.id)))
      .limit(1);
    if (!supplier) return res.status(404).json({ error: 'Fornecedor não encontrado' });

    // Relations
    const [defaultCategory] = supplier.defaultCategoryId
      ? await db.select().from(t.financialCategory).where(eq(t.financialCategory.id, supplier.defaultCategoryId)).limit(1)
      : [];
    const [defaultBankAccount] = supplier.defaultBankAccountId
      ? await db.select().from(t.bankAccount).where(eq(t.bankAccount.id, supplier.defaultBankAccountId)).limit(1)
      : [];
    const payables = await db.select({
      id: t.payable.id,
      amount: t.payable.amount,
      dueDate: t.payable.dueDate,
      status: t.payable.status,
      invoiceNumber: t.payable.invoiceNumber,
    })
      .from(t.payable)
      .where(eq(t.payable.supplierId, supplier.id))
      .orderBy(desc(t.payable.dueDate))
      .limit(10);

    res.json({
      ...supplier,
      defaultCategory: defaultCategory || null,
      defaultBankAccount: defaultBankAccount || null,
      payables,
    });
  } catch (err) {
    console.error('[bpo suppliers get]', err);
    res.status(500).json({ error: 'Erro ao buscar fornecedor' });
  }
});

// CREATE
router.post('/', async (req, res) => {
  try {
    const { cnpj, name, email, phone, pixKey, bankCode, agency, account, defaultCategoryId, defaultBankAccountId, notes } = req.body;
    if (!name || !cnpj) return res.status(400).json({ error: 'Nome e CNPJ obrigatórios' });
    if (!isValidCnpj(cnpj)) return res.status(400).json({ error: 'CNPJ inválido (precisa ter 14 dígitos)' });

    // Checa duplicidade
    const [existing] = await db.select()
      .from(t.supplier)
      .where(and(eq(t.supplier.clientId, req.bpoClient.id), eq(t.supplier.cnpj, cleanCnpj(cnpj))))
      .limit(1);
    if (existing) return res.status(409).json({ error: 'CNPJ já cadastrado pra este cliente' });

    const [supplier] = await db.insert(t.supplier).values({
      id: crypto.randomUUID(),
      clientId: req.bpoClient.id,
      cnpj: cleanCnpj(cnpj),
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      pixKey: pixKey?.trim() || null,
      bankCode: bankCode || null,
      agency: agency || null,
      account: account || null,
      defaultCategoryId: defaultCategoryId || null,
      defaultBankAccountId: defaultBankAccountId || null,
      notes: notes?.trim() || null,
      updatedAt: new Date().toISOString(),
    }).returning();
    res.status(201).json(supplier);
  } catch (err) {
    console.error('[bpo suppliers create]', err);
    res.status(500).json({ error: 'Erro ao criar fornecedor' });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const [existing] = await db.select()
      .from(t.supplier)
      .where(and(eq(t.supplier.id, req.params.id), eq(t.supplier.clientId, req.bpoClient.id)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Fornecedor não encontrado' });

    const { cnpj, name, email, phone, pixKey, bankCode, agency, account, defaultCategoryId, defaultBankAccountId, notes } = req.body;

    // Se mudou CNPJ, valida + checa duplicidade
    if (cnpj && cleanCnpj(cnpj) !== existing.cnpj) {
      if (!isValidCnpj(cnpj)) return res.status(400).json({ error: 'CNPJ inválido' });
      const [dup] = await db.select()
        .from(t.supplier)
        .where(and(eq(t.supplier.clientId, req.bpoClient.id), eq(t.supplier.cnpj, cleanCnpj(cnpj))))
        .limit(1);
      if (dup) return res.status(409).json({ error: 'CNPJ já cadastrado' });
    }

    const [supplier] = await db.update(t.supplier)
      .set({
        ...(cnpj !== undefined ? { cnpj: cleanCnpj(cnpj) } : {}),
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(email !== undefined ? { email: email?.trim() || null } : {}),
        ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
        ...(pixKey !== undefined ? { pixKey: pixKey?.trim() || null } : {}),
        ...(bankCode !== undefined ? { bankCode: bankCode || null } : {}),
        ...(agency !== undefined ? { agency: agency || null } : {}),
        ...(account !== undefined ? { account: account || null } : {}),
        ...(defaultCategoryId !== undefined ? { defaultCategoryId: defaultCategoryId || null } : {}),
        ...(defaultBankAccountId !== undefined ? { defaultBankAccountId: defaultBankAccountId || null } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(t.supplier.id, req.params.id))
      .returning();
    res.json(supplier);
  } catch (err) {
    console.error('[bpo suppliers update]', err);
    res.status(500).json({ error: 'Erro ao atualizar fornecedor' });
  }
});

// DELETE (soft delete: regra do projeto — delete físico é proibido)
router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await db.select()
      .from(t.supplier)
      .where(and(eq(t.supplier.id, req.params.id), eq(t.supplier.clientId, req.bpoClient.id)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Fornecedor não encontrado' });

    // Soft delete sempre — marca active=false, preserva histórico e FKs com payables
    await db.update(t.supplier)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(t.supplier.id, req.params.id));
    res.json({ success: true, softDeleted: true });
  } catch (err) {
    console.error('[bpo suppliers delete]', err);
    res.status(500).json({ error: 'Erro ao excluir fornecedor' });
  }
});

module.exports = router;
