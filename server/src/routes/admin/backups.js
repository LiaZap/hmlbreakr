/**
 * Admin Backups — endpoints administrativos pra gerenciar backups manuais.
 *
 * Mountado em /api/admin/backups (vide routes.js). Protegido com requireSuperAdmin.
 *
 * Endpoints:
 *   POST /run-now — dispara um backup imediato (mesma lógica do cron job).
 *                   Retorna { success, filename, sizeBytes }.
 */

const express = require('express');
const { runBackup } = require('../../services/backupScheduler');

const router = express.Router();

router.post('/run-now', async (req, res) => {
  try {
    const { filename, sizeBytes, counts } = await runBackup('manual-admin');
    return res.json({ success: true, filename, sizeBytes, counts });
  } catch (err) {
    console.error('[admin/backups/run-now]', err);
    return res.status(500).json({ success: false, error: err.message || 'Erro ao executar backup' });
  }
});

module.exports = router;
