/**
 * BPO — Cadastro de Categorias Financeiras
 * Hierárquica (parent/child) + dreGroup pra mapear no DRE.
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireBpoClient, requireBpoOperator } = require('./middleware');

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

router.use(requireBpoOperator);
router.use(requireBpoClient);

const VALID_TYPES = ['receita', 'despesa'];
const VALID_DRE_GROUPS = ['cmv', 'despesa_op', 'taxa_venda', 'imposto', 'pro_labore', 'receita', 'outros'];

// LIST (com hierarquia opcional)
router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    const where = {
      clientId: req.bpoClient.id,
      active: true,
      ...(type && VALID_TYPES.includes(type) ? { type } : {}),
    };
    const items = await prisma.financialCategory.findMany({
      where,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { payables: true, receivables: true, children: true } },
      },
    });
    res.json({ items, total: items.length });
  } catch (err) {
    console.error('[bpo categories list]', err);
    res.status(500).json({ error: 'Erro ao listar categorias' });
  }
});

// CREATE
router.post('/', async (req, res) => {
  try {
    const { name, type, parentId, dreGroup, color } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'name e type obrigatórios' });
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: `type deve ser: ${VALID_TYPES.join(', ')}` });
    if (dreGroup && !VALID_DRE_GROUPS.includes(dreGroup)) {
      return res.status(400).json({ error: `dreGroup deve ser: ${VALID_DRE_GROUPS.join(', ')}` });
    }
    const item = await prisma.financialCategory.create({
      data: {
        clientId: req.bpoClient.id,
        name: name.trim(),
        type,
        parentId: parentId || null,
        dreGroup: dreGroup || null,
        color: color || null,
      },
    });
    res.status(201).json(item);
  } catch (err) {
    console.error('[bpo categories create]', err);
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.financialCategory.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
    });
    if (!existing) return res.status(404).json({ error: 'Categoria não encontrada' });

    const { name, type, parentId, dreGroup, color, active } = req.body;
    const item = await prisma.financialCategory.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(type !== undefined && VALID_TYPES.includes(type) ? { type } : {}),
        ...(parentId !== undefined ? { parentId: parentId || null } : {}),
        ...(dreGroup !== undefined ? { dreGroup: dreGroup || null } : {}),
        ...(color !== undefined ? { color: color || null } : {}),
        ...(active !== undefined ? { active: !!active } : {}),
      },
    });
    res.json(item);
  } catch (err) {
    console.error('[bpo categories update]', err);
    res.status(500).json({ error: 'Erro ao atualizar categoria' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.financialCategory.findFirst({
      where: { id: req.params.id, clientId: req.bpoClient.id },
      include: { _count: { select: { payables: true, receivables: true, children: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Categoria não encontrada' });

    const inUse = existing._count.payables + existing._count.receivables + existing._count.children;
    if (inUse > 0) {
      // Soft delete
      await prisma.financialCategory.update({
        where: { id: req.params.id },
        data: { active: false },
      });
      return res.json({ success: true, softDeleted: true });
    }
    await prisma.financialCategory.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('[bpo categories delete]', err);
    res.status(500).json({ error: 'Erro ao excluir categoria' });
  }
});

// BULK IMPORT (Excel-style — array de { name, type, dreGroup? })
router.post('/bulk', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array obrigatório' });
    }
    const created = [];
    const errors = [];
    for (const [idx, raw] of items.entries()) {
      try {
        if (!raw.name || !raw.type) {
          errors.push({ idx, error: 'name e type obrigatórios' });
          continue;
        }
        if (!VALID_TYPES.includes(raw.type)) {
          errors.push({ idx, error: `type inválido: ${raw.type}` });
          continue;
        }
        const item = await prisma.financialCategory.create({
          data: {
            clientId: req.bpoClient.id,
            name: String(raw.name).trim(),
            type: raw.type,
            dreGroup: raw.dreGroup && VALID_DRE_GROUPS.includes(raw.dreGroup) ? raw.dreGroup : null,
            color: raw.color || null,
          },
        });
        created.push(item);
      } catch (err) {
        errors.push({ idx, error: err.message });
      }
    }
    res.json({ created: created.length, errors });
  } catch (err) {
    console.error('[bpo categories bulk]', err);
    res.status(500).json({ error: 'Erro no import em massa' });
  }
});

module.exports = router;
