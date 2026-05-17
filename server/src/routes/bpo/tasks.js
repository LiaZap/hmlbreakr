/**
 * BPO — Tarefas (BpoTask)
 * CRUD completo + filtros + agrupamento. Funciona multi-cliente (sem clientHash)
 * pra o painel do operador BPO.
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireBpoOperator } = require('./middleware');

const router = express.Router();
const prisma = new PrismaClient();

router.use(requireBpoOperator);

// LIST com filtros
router.get('/', async (req, res) => {
  try {
    const { status, severity, type, clientId, assignedTo, page = 1, pageSize = 50 } = req.query;
    const where = {
      ...(status && status !== 'all' ? { status } : {}),
      ...(severity ? { severity } : {}),
      ...(type ? { type } : {}),
      ...(clientId ? { clientId } : {}),
      ...(assignedTo ? { assignedTo } : {}),
    };
    const [items, total, summary] = await Promise.all([
      prisma.bpoTask.findMany({
        where,
        orderBy: [{ severity: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
        skip: (parseInt(page, 10) - 1) * parseInt(pageSize, 10),
        take: parseInt(pageSize, 10),
        include: { client: { select: { name: true, hash: true } } },
      }),
      prisma.bpoTask.count({ where }),
      prisma.bpoTask.groupBy({
        by: ['status'],
        _count: true,
      }),
    ]);
    const summaryByStatus = summary.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {});
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
    const item = await prisma.bpoTask.create({
      data: {
        clientId, type, severity, title,
        description: description || null,
        dueAt: dueAt ? new Date(dueAt) : null,
        assignedTo: assignedTo || null,
        relatedType: relatedType || null,
        relatedId: relatedId || null,
      },
    });
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
  const found = await prisma.bpoTask.findFirst({ where: { id: taskId, clientId } });
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

    const item = await prisma.bpoTask.update({ where: { id: req.params.id }, data });
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

    const item = await prisma.bpoTask.update({
      where: { id: req.params.id },
      data: { status: 'resolved', resolvedAt: new Date() },
    });
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

    const item = await prisma.bpoTask.update({
      where: { id: req.params.id },
      data: { status: 'dismissed', resolvedAt: new Date() },
    });
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

    const item = await prisma.bpoTask.update({
      where: { id: req.params.id },
      data: { status: 'in_progress' },
    });
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

    const item = await prisma.bpoTask.update({
      where: { id: req.params.id },
      data: { assignedTo: assignedTo || null },
    });
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

    await prisma.bpoTask.update({
      where: { id: req.params.id },
      data: { status: 'dismissed', resolvedAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
