/**
 * BPO — Tarefas (BpoTask)
 * CRUD completo + filtros + agrupamento. Funciona multi-cliente (sem clientHash)
 * pra o painel do operador BPO.
 */

const express = require('express');
const { db } = require('../../db/client');
const t = require('../../db/schema-bpo');
const { eq, and, or, ne, gt, gte, lt, lte, inArray, notInArray, isNull, isNotNull, desc, asc, sql, count, getTableColumns } = require('drizzle-orm');
const crypto = require('crypto');
const { requireBpoOperator } = require('./middleware');

const router = express.Router();

router.use(requireBpoOperator);

// LIST com filtros
router.get('/', async (req, res) => {
  try {
    const { status, severity, type, clientId, assignedTo, page = 1, pageSize = 50 } = req.query;
    const conds = [
      ...(status && status !== 'all' ? [eq(t.bpoTask.status, status)] : []),
      ...(severity ? [eq(t.bpoTask.severity, severity)] : []),
      ...(type ? [eq(t.bpoTask.type, type)] : []),
      ...(clientId ? [eq(t.bpoTask.clientId, clientId)] : []),
      ...(assignedTo ? [eq(t.bpoTask.assignedTo, assignedTo)] : []),
    ];
    const where = conds.length ? and(...conds) : undefined;
    const [items, totalRows, summary] = await Promise.all([
      db.select({
        ...getTableColumns(t.bpoTask),
        client: { name: t.client.name, hash: t.client.hash },
      })
        .from(t.bpoTask)
        .leftJoin(t.client, eq(t.bpoTask.clientId, t.client.id))
        .where(where)
        .orderBy(asc(t.bpoTask.severity), asc(t.bpoTask.dueAt), desc(t.bpoTask.createdAt))
        .limit(parseInt(pageSize, 10))
        .offset((parseInt(page, 10) - 1) * parseInt(pageSize, 10)),
      db.select({ n: count() }).from(t.bpoTask).where(where),
      db.select({ status: t.bpoTask.status, n: count() }).from(t.bpoTask).groupBy(t.bpoTask.status),
    ]);
    const total = totalRows[0]?.n ?? 0;
    const summaryByStatus = summary.reduce((acc, s) => ({ ...acc, [s.status]: s.n }), {});
    res.json({ items, total, page: parseInt(page, 10), pageSize: parseInt(pageSize, 10), summary: summaryByStatus });
  } catch (err) {
    console.error('[bpo tasks list]', err);
    res.status(500).json({ error: err.message });
  }
});

// CREATE manual
router.post('/', async (req, res) => {
  try {
    const { clientId, type = 'manual', severity = 'normal', title, description, dueAt, assignedTo, relatedType, relatedId } = req.body;
    if (!clientId || !title) return res.status(400).json({ error: 'clientId e title obrigatórios' });
    const [item] = await db.insert(t.bpoTask).values({
      id: crypto.randomUUID(),
      clientId, type, severity, title,
      description: description || null,
      dueAt: dueAt ? new Date(dueAt) : null,
      assignedTo: assignedTo || null,
      relatedType: relatedType || null,
      relatedId: relatedId || null,
      updatedAt: new Date(),
    }).returning();
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Resolve o clientId do tenant a partir do body/query e valida que a BpoTask
 * informada pertence a esse cliente. Previne IDOR — sem isso um operador
 * poderia alterar tarefa de qualquer cliente passando só o :id.
 * @returns {Promise<{ok: true} | {ok: false, status: number, error: string}>}
 */
const assertTaskTenant = async (taskId, clientId) => {
  if (!clientId) return { ok: false, status: 400, error: 'clientId obrigatório' };
  const [found] = await db.select().from(t.bpoTask)
    .where(and(eq(t.bpoTask.id, taskId), eq(t.bpoTask.clientId, clientId)))
    .limit(1);
  if (!found) return { ok: false, status: 404, error: 'Registro não encontrado' };
  return { ok: true };
};

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const clientId = req.body.clientId;
    const guard = await assertTaskTenant(req.params.id, clientId);
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

    const data = {};
    ['severity', 'title', 'description', 'assignedTo', 'status'].forEach((f) => {
      if (req.body[f] !== undefined) data[f] = req.body[f];
    });
    if (req.body.dueAt !== undefined) data.dueAt = req.body.dueAt ? new Date(req.body.dueAt) : null;
    if (data.status === 'resolved' && !data.resolvedAt) data.resolvedAt = new Date();
    data.updatedAt = new Date();

    const [item] = await db.update(t.bpoTask).set(data).where(eq(t.bpoTask.id, req.params.id)).returning();
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Quick actions
router.post('/:id/resolve', async (req, res) => {
  try {
    const clientId = req.body.clientId || req.query.clientId;
    const guard = await assertTaskTenant(req.params.id, clientId);
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

    const [item] = await db.update(t.bpoTask)
      .set({ status: 'resolved', resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(t.bpoTask.id, req.params.id))
      .returning();
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/dismiss', async (req, res) => {
  try {
    const clientId = req.body.clientId || req.query.clientId;
    const guard = await assertTaskTenant(req.params.id, clientId);
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

    const [item] = await db.update(t.bpoTask)
      .set({ status: 'dismissed', resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(t.bpoTask.id, req.params.id))
      .returning();
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/start', async (req, res) => {
  try {
    const clientId = req.body.clientId || req.query.clientId;
    const guard = await assertTaskTenant(req.params.id, clientId);
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

    const [item] = await db.update(t.bpoTask)
      .set({ status: 'in_progress', updatedAt: new Date() })
      .where(eq(t.bpoTask.id, req.params.id))
      .returning();
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/assign', async (req, res) => {
  try {
    const { assignedTo, clientId } = req.body;
    const guard = await assertTaskTenant(req.params.id, clientId);
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

    const [item] = await db.update(t.bpoTask)
      .set({ assignedTo: assignedTo || null, updatedAt: new Date() })
      .where(eq(t.bpoTask.id, req.params.id))
      .returning();
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE — soft delete: BpoTask não tem status 'deleted', delete físico é
// proibido. A rota vira um dismiss lógico (status: 'dismissed').
router.delete('/:id', async (req, res) => {
  try {
    const clientId = req.body.clientId || req.query.clientId;
    const guard = await assertTaskTenant(req.params.id, clientId);
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

    await db.update(t.bpoTask)
      .set({ status: 'dismissed', resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(t.bpoTask.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
