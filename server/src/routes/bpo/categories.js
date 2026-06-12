/**
 * BPO — Cadastro de Categorias Financeiras
 * Hierárquica (parent/child) + dreGroup pra mapear no DRE.
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

const VALID_TYPES = ['receita', 'despesa'];
const VALID_DRE_GROUPS = ['cmv', 'despesa_op', 'taxa_venda', 'imposto', 'pro_labore', 'receita', 'outros'];

// LIST (com hierarquia opcional)
router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    const conds = [
      eq(t.financialCategory.clientId, req.bpoClient.id),
      eq(t.financialCategory.active, true),
    ];
    if (type && VALID_TYPES.includes(type)) {
      conds.push(eq(t.financialCategory.type, type));
    }
    const rows = await db.select()
      .from(t.financialCategory)
      .where(and(...conds))
      .orderBy(asc(t.financialCategory.type), asc(t.financialCategory.name));

    // parent: { id, name } (self-relation via parentId) + _count agregado por categoria
    const items = await Promise.all(rows.map(async (row) => {
      let parent = null;
      if (row.parentId) {
        const [p] = await db.select({ id: t.financialCategory.id, name: t.financialCategory.name })
          .from(t.financialCategory)
          .where(eq(t.financialCategory.id, row.parentId))
          .limit(1);
        parent = p || null;
      }
      const [payablesCount] = await db.select({ n: count() })
        .from(t.payable)
        .where(eq(t.payable.categoryId, row.id));
      const [receivablesCount] = await db.select({ n: count() })
        .from(t.receivable)
        .where(eq(t.receivable.categoryId, row.id));
      const [childrenCount] = await db.select({ n: count() })
        .from(t.financialCategory)
        .where(eq(t.financialCategory.parentId, row.id));
      return {
        ...row,
        parent,
        _count: {
          payables: payablesCount.n,
          receivables: receivablesCount.n,
          children: childrenCount.n,
        },
      };
    }));

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
    const [item] = await db.insert(t.financialCategory).values({
      id: crypto.randomUUID(),
      clientId: req.bpoClient.id,
      name: name.trim(),
      type,
      parentId: parentId || null,
      dreGroup: dreGroup || null,
      color: color || null,
      updatedAt: new Date().toISOString(),
    }).returning();
    res.status(201).json(item);
  } catch (err) {
    console.error('[bpo categories create]', err);
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const [existing] = await db.select()
      .from(t.financialCategory)
      .where(and(
        eq(t.financialCategory.id, req.params.id),
        eq(t.financialCategory.clientId, req.bpoClient.id),
      ))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Categoria não encontrada' });

    const { name, type, parentId, dreGroup, color, active } = req.body;
    const data = {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(type !== undefined && VALID_TYPES.includes(type) ? { type } : {}),
      ...(parentId !== undefined ? { parentId: parentId || null } : {}),
      ...(dreGroup !== undefined ? { dreGroup: dreGroup || null } : {}),
      ...(color !== undefined ? { color: color || null } : {}),
      ...(active !== undefined ? { active: !!active } : {}),
      updatedAt: new Date().toISOString(),
    };
    const [item] = await db.update(t.financialCategory)
      .set(data)
      .where(eq(t.financialCategory.id, req.params.id))
      .returning();
    res.json(item);
  } catch (err) {
    console.error('[bpo categories update]', err);
    res.status(500).json({ error: 'Erro ao atualizar categoria' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await db.select()
      .from(t.financialCategory)
      .where(and(
        eq(t.financialCategory.id, req.params.id),
        eq(t.financialCategory.clientId, req.bpoClient.id),
      ))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Categoria não encontrada' });

    // Soft delete sempre — regra do projeto: delete físico é proibido
    await db.update(t.financialCategory)
      .set({ active: false, updatedAt: new Date().toISOString() })
      .where(eq(t.financialCategory.id, req.params.id));
    res.json({ success: true, softDeleted: true });
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
        const [item] = await db.insert(t.financialCategory).values({
          id: crypto.randomUUID(),
          clientId: req.bpoClient.id,
          name: String(raw.name).trim(),
          type: raw.type,
          dreGroup: raw.dreGroup && VALID_DRE_GROUPS.includes(raw.dreGroup) ? raw.dreGroup : null,
          color: raw.color || null,
          updatedAt: new Date().toISOString(),
        }).returning();
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
