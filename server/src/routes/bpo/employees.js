/**
 * BPO — Cadastro de Funcionários
 * Versão BPO (com CPF + dados bancários + variáveis), separada do Employee do onboarding.
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireBpoClient, requireBpoOperator } = require('./middleware');

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

router.use(requireBpoOperator);
router.use(requireBpoClient);

const cleanCpf = (cpf) => String(cpf || '').replace(/\D/g, '');
const isValidCpf = (cpf) => cleanCpf(cpf).length === 11;

const VALID_ROLES = ['Cozinha', 'Salão', 'Administrativo', 'Entrega', 'Outro'];

router.get('/', async (req, res) => {
  try {
    const { search, role } = req.query;
    const where = {
      clientId: req.bpoClient.id,
      active: true,
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { cpf: { contains: cleanCpf(search) } },
        ]
      } : {}),
      ...(role ? { role } : {}),
    };
    const items = await prisma.bpoEmployee.findMany({
      where,
      orderBy: { name: 'asc' },
    });
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

    const dup = await prisma.bpoEmployee.findUnique({
      where: { clientId_cpf: { clientId: req.bpoClient.id, cpf: cleanCpf(cpf) } },
    });
    if (dup) return res.status(409).json({ error: 'CPF já cadastrado pra este cliente' });

    const item = await prisma.bpoEmployee.create({
      data: {
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
        hiredAt: hiredAt ? new Date(hiredAt) : null,
      },
    });
    res.status(201).json(item);
  } catch (err) {
    console.error('[bpo employees create]', err);
    res.status(500).json({ error: 'Erro ao criar funcionário' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.bpoEmployee.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
    if (!existing) return res.status(404).json({ error: 'Funcionário não encontrado' });

    const { cpf } = req.body;
    if (cpf && cleanCpf(cpf) !== existing.cpf) {
      if (!isValidCpf(cpf)) return res.status(400).json({ error: 'CPF inválido' });
      const dup = await prisma.bpoEmployee.findUnique({
        where: { clientId_cpf: { clientId: req.bpoClient.id, cpf: cleanCpf(cpf) } },
      });
      if (dup) return res.status(409).json({ error: 'CPF já cadastrado' });
    }

    const data = {};
    const fields = ['name', 'email', 'phone', 'bankCode', 'agency', 'account', 'pixKey', 'role', 'isFreelancer', 'isMotoboy', 'active'];
    fields.forEach((f) => { if (req.body[f] !== undefined) data[f] = req.body[f]; });
    if (cpf !== undefined) data.cpf = cleanCpf(cpf);
    ['baseSalary', 'commissionPct', 'tipsAmount', 'overtimeAmount'].forEach((f) => {
      if (req.body[f] !== undefined) data[f] = req.body[f] === '' || req.body[f] === null ? null : parseFloat(req.body[f]);
    });
    if (req.body.hiredAt !== undefined) data.hiredAt = req.body.hiredAt ? new Date(req.body.hiredAt) : null;

    const item = await prisma.bpoEmployee.update({ where: { id: req.params.id }, data });
    res.json(item);
  } catch (err) {
    console.error('[bpo employees update]', err);
    res.status(500).json({ error: 'Erro ao atualizar funcionário' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.bpoEmployee.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
    if (!existing) return res.status(404).json({ error: 'Funcionário não encontrado' });
    // Soft delete
    await prisma.bpoEmployee.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ success: true, softDeleted: true });
  } catch (err) {
    console.error('[bpo employees delete]', err);
    res.status(500).json({ error: 'Erro ao excluir funcionário' });
  }
});

module.exports = router;
