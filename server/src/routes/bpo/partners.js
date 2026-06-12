/**
 * BPO — Cadastro de Sócios
 * Inclui regra "Retirada de Capital": após atingir o pró-labore informado,
 * pagamentos extras pro CPF do sócio são lançados como "Retirada de Capital".
 *
 * (A regra é aplicada na criação do PaymentTransaction — aqui só guarda o config.)
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

router.get('/', async (req, res) => {
  try {
    const items = await db.select().from(t.bpoPartner)
      .where(and(eq(t.bpoPartner.clientId, req.bpoClient.id), eq(t.bpoPartner.active, true)))
      .orderBy(asc(t.bpoPartner.name));
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

    const [dup] = await db.select().from(t.bpoPartner)
      .where(and(eq(t.bpoPartner.clientId, req.bpoClient.id), eq(t.bpoPartner.cpf, cleanCpf(cpf))))
      .limit(1);
    if (dup) return res.status(409).json({ error: 'CPF já cadastrado pra este cliente' });

    const [item] = await db.insert(t.bpoPartner).values({
      id: crypto.randomUUID(),
      clientId: req.bpoClient.id,
      name: name.trim(),
      cpf: cleanCpf(cpf),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      prolaboreAmount: parseFloat(prolaboreAmount) || 0,
      personalAccountBank: personalAccountBank || null,
      personalAccountAgency: personalAccountAgency || null,
      personalAccountNumber: personalAccountNumber || null,
      updatedAt: new Date(),
    }).returning();
    res.status(201).json(item);
  } catch (err) {
    console.error('[bpo partners create]', err);
    res.status(500).json({ error: 'Erro ao criar sócio' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const [existing] = await db.select().from(t.bpoPartner)
      .where(and(eq(t.bpoPartner.id, req.params.id), eq(t.bpoPartner.clientId, req.bpoClient.id)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Sócio não encontrado' });

    const { cpf } = req.body;
    if (cpf && cleanCpf(cpf) !== existing.cpf) {
      if (!isValidCpf(cpf)) return res.status(400).json({ error: 'CPF inválido' });
      const [dup] = await db.select().from(t.bpoPartner)
        .where(and(eq(t.bpoPartner.clientId, req.bpoClient.id), eq(t.bpoPartner.cpf, cleanCpf(cpf))))
        .limit(1);
      if (dup) return res.status(409).json({ error: 'CPF já cadastrado' });
    }

    const data = {};
    ['name', 'email', 'phone', 'personalAccountBank', 'personalAccountAgency', 'personalAccountNumber', 'active'].forEach((f) => {
      if (req.body[f] !== undefined) data[f] = req.body[f];
    });
    if (cpf !== undefined) data.cpf = cleanCpf(cpf);
    if (req.body.prolaboreAmount !== undefined) data.prolaboreAmount = parseFloat(req.body.prolaboreAmount) || 0;

    data.updatedAt = new Date();
    const [item] = await db.update(t.bpoPartner).set(data)
      .where(eq(t.bpoPartner.id, req.params.id)).returning();
    res.json(item);
  } catch (err) {
    console.error('[bpo partners update]', err);
    res.status(500).json({ error: 'Erro ao atualizar sócio' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await db.select().from(t.bpoPartner)
      .where(and(eq(t.bpoPartner.id, req.params.id), eq(t.bpoPartner.clientId, req.bpoClient.id)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Sócio não encontrado' });
    await db.update(t.bpoPartner).set({ active: false, updatedAt: new Date() })
      .where(eq(t.bpoPartner.id, req.params.id));
    res.json({ success: true, softDeleted: true });
  } catch (err) {
    console.error('[bpo partners delete]', err);
    res.status(500).json({ error: 'Erro ao excluir sócio' });
  }
});

module.exports = router;
