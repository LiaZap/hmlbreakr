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

// UPDATE
router.put('/:id', async (req, res) => {
  try {
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
    const { assignedTo } = req.body;
    const item = await prisma.bpoTask.update({
      where: { id: req.params.id },
      data: { assignedTo: assignedTo || null },
    });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.bpoTask.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
