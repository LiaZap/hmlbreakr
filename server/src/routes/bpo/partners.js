/**
 * BPO — Cadastro de Sócios
 * Inclui regra "Retirada de Capital": após atingir o pró-labore informado,
 * pagamentos extras pro CPF do sócio são lançados como "Retirada de Capital".
 *
 * (A regra é aplicada na criação do PaymentTransaction — aqui só guarda o config.)
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

router.get('/', async (req, res) => {
  try {
    const items = await prisma.bpoPartner.findMany({
      where: { clientId: req.bpoClient.id, active: true },
      orderBy: { name: 'asc' },
    });
    // Calcula soma total de pró-labores
    const totalProlabore = items.reduce((acc, p) => acc + Number(p.prolaboreAmount || 0), 0);
    res.json({ items, total: items.length, totalProlabore });
  } catch (err) {
    console.error('[bpo partners list]', err);
    res.status(500).json({ error: 'Erro ao listar sócios' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, cpf, email, phone, prolaboreAmount, personalAccountBank, personalAccountAgency, personalAccountNumber } = req.body;
    if (!name || !cpf || prolaboreAmount === undefined) {
      return res.status(400).json({ error: 'name, cpf e prolaboreAmount obrigatórios' });
    }
    if (!isValidCpf(cpf)) return res.status(400).json({ error: 'CPF inválido (precisa 11 dígitos)' });

    const dup = await prisma.bpoPartner.findUnique({
      where: { clientId_cpf: { clientId: req.bpoClient.id, cpf: cleanCpf(cpf) } },
    });
    if (dup) return res.status(409).json({ error: 'CPF já cadastrado pra este cliente' });

    const item = await prisma.bpoPartner.create({
      data: {
        clientId: req.bpoClient.id,
        name: name.trim(),
        cpf: cleanCpf(cpf),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        prolaboreAmount: parseFloat(prolaboreAmount) || 0,
        personalAccountBank: personalAccountBank || null,
        personalAccountAgency: personalAccountAgency || null,
        personalAccountNumber: personalAccountNumber || null,
      },
    });
    res.status(201).json(item);
  } catch (err) {
    console.error('[bpo partners create]', err);
    res.status(500).json({ error: 'Erro ao criar sócio' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.bpoPartner.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
    if (!existing) return res.status(404).json({ error: 'Sócio não encontrado' });

    const { cpf } = req.body;
    if (cpf && cleanCpf(cpf) !== existing.cpf) {
      if (!isValidCpf(cpf)) return res.status(400).json({ error: 'CPF inválido' });
      const dup = await prisma.bpoPartner.findUnique({
        where: { clientId_cpf: { clientId: req.bpoClient.id, cpf: cleanCpf(cpf) } },
      });
      if (dup) return res.status(409).json({ error: 'CPF já cadastrado' });
    }

    const data = {};
    ['name', 'email', 'phone', 'personalAccountBank', 'personalAccountAgency', 'personalAccountNumber', 'active'].forEach((f) => {
      if (req.body[f] !== undefined) data[f] = req.body[f];
    });
    if (cpf !== undefined) data.cpf = cleanCpf(cpf);
    if (req.body.prolaboreAmount !== undefined) data.prolaboreAmount = parseFloat(req.body.prolaboreAmount) || 0;

    const item = await prisma.bpoPartner.update({ where: { id: req.params.id }, data });
    res.json(item);
  } catch (err) {
    console.error('[bpo partners update]', err);
    res.status(500).json({ error: 'Erro ao atualizar sócio' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.bpoPartner.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
    if (!existing) return res.status(404).json({ error: 'Sócio não encontrado' });
    await prisma.bpoPartner.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ success: true, softDeleted: true });
  } catch (err) {
    console.error('[bpo partners delete]', err);
    res.status(500).json({ error: 'Erro ao excluir sócio' });
  }
});

module.exports = router;
