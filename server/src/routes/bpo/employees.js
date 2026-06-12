/**
 * BPO — Cadastro de Funcionários
 * Versão BPO (com CPF + dados bancários + variáveis), separada do Employee do onboarding.
 */

const express = require('express');
const { db } = require('../../db/client');
const t = require('../../db/schema-bpo');
const { eq, and, or, ne, gt, gte, lt, lte, inArray, notInArray, isNull, isNotNull, desc, asc, sql, count } = require('drizzle-orm');
const crypto = require('crypto');
const { requireBpoClient, requireBpoOperator } = require('./middleware');

const router = express.Router({ mergeParams: true });

router.use(requireBpoOperator);
router.use(requireBpoClient);

const cleanCpf = (cpf) => String(cpf || '').replace(/\D/g, '');
const isValidCpf = (cpf) => cleanCpf(cpf).length === 11;

const VALID_ROLES = ['Cozinha', 'Salão', 'Administrativo', 'Entrega', 'Outro'];

router.get('/', async (req, res) => {
  try {
    const { search, role } = req.query;
    const conditions = [
      eq(t.bpoEmployee.clientId, req.bpoClient.id),
      eq(t.bpoEmployee.active, true),
    ];
    if (search) {
      conditions.push(or(
        sql`${t.bpoEmployee.name} ILIKE ${'%' + search + '%'}`,
        sql`${t.bpoEmployee.cpf} LIKE ${'%' + cleanCpf(search) + '%'}`,
      ));
    }
    if (role) {
      conditions.push(eq(t.bpoEmployee.role, role));
    }
    const items = await db.select()
      .from(t.bpoEmployee)
      .where(and(...conditions))
      .orderBy(asc(t.bpoEmployee.name));
    res.json({ items, total: items.length });
  } catch (err) {
    console.error('[bpo employees list]', err);
    res.status(500).json({ error: 'Erro ao listar funcionários' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, cpf, email, phone, bankCode, agency, account, pixKey, role, isFreelancer, isMotoboy, baseSalary, commissionPct, tipsAmount, overtimeAmount, hiredAt } = req.body;
    if (!name || !cpf || !role) return res.status(400).json({ error: 'name, cpf e role obrigatórios' });
    if (!isValidCpf(cpf)) return res.status(400).json({ error: 'CPF inválido (precisa 11 dígitos)' });

    const [dup] = await db.select()
      .from(t.bpoEmployee)
      .where(and(
        eq(t.bpoEmployee.clientId, req.bpoClient.id),
        eq(t.bpoEmployee.cpf, cleanCpf(cpf)),
      ))
      .limit(1);
    if (dup) return res.status(409).json({ error: 'CPF já cadastrado pra este cliente' });

    const nowIso = new Date().toISOString();
    const [item] = await db.insert(t.bpoEmployee).values({
      id: crypto.randomUUID(),
      clientId: req.bpoClient.id,
      name: name.trim(),
      cpf: cleanCpf(cpf),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      bankCode: bankCode || null,
      agency: agency || null,
      account: account || null,
      pixKey: pixKey?.trim() || null,
      role,
      isFreelancer: !!isFreelancer,
      isMotoboy: !!isMotoboy,
      baseSalary: baseSalary ? parseFloat(baseSalary) : null,
      commissionPct: commissionPct ? parseFloat(commissionPct) : null,
      tipsAmount: tipsAmount ? parseFloat(tipsAmount) : null,
      overtimeAmount: overtimeAmount ? parseFloat(overtimeAmount) : null,
      hiredAt: hiredAt ? new Date(hiredAt).toISOString() : null,
      updatedAt: nowIso,
    }).returning();
    res.status(201).json(item);
  } catch (err) {
    console.error('[bpo employees create]', err);
    res.status(500).json({ error: 'Erro ao criar funcionário' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const [existing] = await db.select()
      .from(t.bpoEmployee)
      .where(and(
        eq(t.bpoEmployee.id, req.params.id),
        eq(t.bpoEmployee.clientId, req.bpoClient.id),
      ))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Funcionário não encontrado' });

    const { cpf } = req.body;
    if (cpf && cleanCpf(cpf) !== existing.cpf) {
      if (!isValidCpf(cpf)) return res.status(400).json({ error: 'CPF inválido' });
      const [dup] = await db.select()
        .from(t.bpoEmployee)
        .where(and(
          eq(t.bpoEmployee.clientId, req.bpoClient.id),
          eq(t.bpoEmployee.cpf, cleanCpf(cpf)),
        ))
        .limit(1);
      if (dup) return res.status(409).json({ error: 'CPF já cadastrado' });
    }

    const data = {};
    const fields = ['name', 'email', 'phone', 'bankCode', 'agency', 'account', 'pixKey', 'role', 'isFreelancer', 'isMotoboy', 'active'];
    fields.forEach((f) => { if (req.body[f] !== undefined) data[f] = req.body[f]; });
    if (cpf !== undefined) data.cpf = cleanCpf(cpf);
    ['baseSalary', 'commissionPct', 'tipsAmount', 'overtimeAmount'].forEach((f) => {
      if (req.body[f] !== undefined) data[f] = req.body[f] === '' || req.body[f] === null ? null : parseFloat(req.body[f]);
    });
    if (req.body.hiredAt !== undefined) data.hiredAt = req.body.hiredAt ? new Date(req.body.hiredAt).toISOString() : null;
    data.updatedAt = new Date().toISOString();

    const [item] = await db.update(t.bpoEmployee).set(data).where(eq(t.bpoEmployee.id, req.params.id)).returning();
    res.json(item);
  } catch (err) {
    console.error('[bpo employees update]', err);
    res.status(500).json({ error: 'Erro ao atualizar funcionário' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await db.select()
      .from(t.bpoEmployee)
      .where(and(
        eq(t.bpoEmployee.id, req.params.id),
        eq(t.bpoEmployee.clientId, req.bpoClient.id),
      ))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Funcionário não encontrado' });
    // Soft delete
    await db.update(t.bpoEmployee).set({ active: false, updatedAt: new Date().toISOString() }).where(eq(t.bpoEmployee.id, req.params.id));
    res.json({ success: true, softDeleted: true });
  } catch (err) {
    console.error('[bpo employees delete]', err);
    res.status(500).json({ error: 'Erro ao excluir funcionário' });
  }
});

module.exports = router;
