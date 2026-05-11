/**
 * Admin Snapshots — gestão de snapshots históricos do Client.data.
 *
 * Criado pós-incidente Garapas (2026-05-11) onde metade do Client.data foi
 * sobrescrito sem possibilidade de recuperação. Agora /client/:hash/sync
 * cria snapshot antes de cada save (até 20 retidos por cliente) — esses
 * endpoints permitem listar e restaurar do painel admin.
 *
 * Mount-point (em routes.js): /admin/clients/:clientId/snapshots — protegido
 * por requireSuperAdmin (restore é destrutivo, exige privilégio elevado).
 *
 * Endpoints:
 *   GET  /admin/clients/:clientId/snapshots                          → lista
 *   POST /admin/clients/:clientId/snapshots/:snapshotId/restore      → restaura
 *
 * O snapshot atual é preservado antes do restore (reason='pre-restore') pra
 * permitir desfazer caso o restore tenha sido erro humano.
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const {
  listSnapshots,
  getSnapshot,
  createSnapshot,
  pruneOldSnapshots,
} = require('../../services/snapshotService');

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

/**
 * GET /admin/clients/:clientId/snapshots
 * Lista todos os snapshots do cliente (sem o campo `data` — só metadata).
 */
router.get('/clients/:clientId/snapshots', async (req, res) => {
  try {
    const { clientId } = req.params;
    if (!clientId) return res.status(400).json({ error: 'clientId é obrigatório' });

    // Valida que o cliente existe (404 explícito ajuda UI)
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, hash: true },
    });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });

    const snapshots = await listSnapshots(prisma, clientId);
    return res.json({
      client: { id: client.id, name: client.name, hash: client.hash },
      count: snapshots.length,
      snapshots,
    });
  } catch (err) {
    console.error('[admin snapshots list] erro:', err);
    return res.status(500).json({ error: 'Erro ao listar snapshots' });
  }
});

/**
 * POST /admin/clients/:clientId/snapshots/:snapshotId/restore
 * Restaura Client.data pro conteúdo do snapshot. ANTES de restaurar, cria
 * um novo snapshot do estado atual com reason='pre-restore' pra permitir
 * desfazer (undo).
 */
router.post(
  '/clients/:clientId/snapshots/:snapshotId/restore',
  async (req, res) => {
    try {
      const { clientId, snapshotId } = req.params;
      if (!clientId || !snapshotId) {
        return res.status(400).json({ error: 'clientId e snapshotId obrigatórios' });
      }

      // 1. Valida cliente
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { id: true, data: true },
      });
      if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });

      // 2. Valida snapshot e que ele pertence ao cliente (segurança: não
      // permitir restaurar snapshot de outro cliente)
      const snap = await getSnapshot(prisma, snapshotId);
      if (!snap) return res.status(404).json({ error: 'Snapshot não encontrado' });
      if (snap.clientId !== clientId) {
        return res.status(403).json({ error: 'Snapshot não pertence a esse cliente' });
      }

      // 3. Snapshot do estado atual antes do restore (pre-restore = undo)
      // Falha aqui ABORTA o restore — perder o estado atual sem backup
      // seria reproduzir o bug original.
      let preRestoreSnapshotId = null;
      try {
        const preSnap = await createSnapshot(
          prisma,
          clientId,
          client.data || '',
          'pre-restore'
        );
        preRestoreSnapshotId = preSnap.id;
      } catch (snapErr) {
        console.error('[admin snapshots restore] pré-snapshot falhou:', snapErr);
        return res.status(500).json({
          error: 'Não foi possível criar backup do estado atual — restore abortado',
        });
      }

      // 4. Restore propriamente dito
      await prisma.client.update({
        where: { id: clientId },
        data: { data: snap.data },
      });

      // 5. Cleanup best-effort
      pruneOldSnapshots(prisma, clientId, 20).catch((err) =>
        console.error('[admin snapshots restore] prune falhou:', err.message)
      );

      const adminEmail = req.adminUser ? req.adminUser.email : 'unknown';
      console.log(
        `[admin snapshots restore] clientId=${clientId} snapshotId=${snapshotId} by=${adminEmail} preRestoreSnapshotId=${preRestoreSnapshotId}`
      );

      return res.json({
        success: true,
        restoredFrom: {
          id: snap.id,
          size: snap.size,
          reason: snap.reason,
          createdAt: snap.createdAt,
        },
        preRestoreSnapshotId, // pra UI oferecer "desfazer"
      });
    } catch (err) {
      console.error('[admin snapshots restore] erro:', err);
      return res.status(500).json({ error: 'Erro ao restaurar snapshot' });
    }
  }
);

module.exports = router;
