/**
 * Backup Scheduler — backup automático diário do banco de dados.
 *
 * Roda dentro do próprio processo Node via node-cron — não depende de
 * crontab do SO (servidor é compartilhado).
 *
 * Schedule: todo dia 03:00 America/Sao_Paulo
 * Output:   server/backups/backup-auto-YYYY-MM-DD.json
 * Retention: mantém só os últimos 30 backups (deleta mais antigos por mtime)
 *
 * Env vars:
 *   BACKUP_ENABLED — "false" desabilita o scheduler (default true). Útil em dev.
 *
 * Exporta runBackup(reason) — usada também pelo script CLI scripts/backup.js
 * (DRY: lógica de export+save vive aqui).
 *
 * Contexto: cliente Garapas perdeu dados em 2026-05-11 porque backup era manual.
 */

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { db } = require('../db/client');
const t = require('../db/schema-bpo');

const BACKUPS_DIR = path.resolve(__dirname, '..', '..', 'backups');
const MAX_BACKUPS = 30;
const LOG_PREFIX = '[backupScheduler]';

/**
 * Garante que a pasta server/backups/ existe.
 */
function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

/**
 * Apaga backups mais antigos, mantendo só os MAX_BACKUPS últimos por mtime.
 */
function pruneOldBackups() {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return;
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter((f) => f.startsWith('backup-auto-') && f.endsWith('.json'))
      .map((f) => {
        const full = path.join(BACKUPS_DIR, f);
        return { name: f, full, mtimeMs: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    const toDelete = files.slice(MAX_BACKUPS);
    for (const f of toDelete) {
      try {
        fs.unlinkSync(f.full);
        console.log(`${LOG_PREFIX} prune: removido ${f.name}`);
      } catch (e) {
        console.error(`${LOG_PREFIX} prune: erro ao remover ${f.name}: ${e.message}`);
      }
    }
  } catch (e) {
    console.error(`${LOG_PREFIX} prune: ${e.message}`);
  }
}

/**
 * Executa um backup completo das tabelas e grava em disco.
 * Reutilizada pelo cron job e pelo script CLI (scripts/backup.js).
 *
 * @param {string} reason — rótulo livre pra log/auditoria (ex: 'cron-daily', 'manual-cli', 'manual-admin')
 * @returns {Promise<{ filename: string, filepath: string, sizeBytes: number, counts: object }>}
 */
async function runBackup(reason = 'unknown') {
  const startedAt = Date.now();

  try {
    ensureBackupsDir();

    const [clients, agencies, teamMembers, broadcasts] = await Promise.all([
      db.select().from(t.client),
      db.select().from(t.agency),
      db.select().from(t.teamMember),
      db.select().from(t.broadcast),
    ]);

    const counts = {
      clients: clients.length,
      agencies: agencies.length,
      teamMembers: teamMembers.length,
      broadcasts: broadcasts.length,
    };

    const data = {
      _meta: {
        version: '1.2',
        exportedAt: new Date().toISOString(),
        reason,
        source: process.env.DATABASE_URL?.replace(/:[^:]*@/, ':***@') || 'unknown',
        counts,
      },
      clients,
      agencies,
      teamMembers,
      broadcasts,
    };

    // Filename: backup-auto-YYYY-MM-DD.json (sobrescreve se já houver backup do mesmo dia)
    const today = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
    const filename = `backup-auto-${today}.json`;
    const filepath = path.join(BACKUPS_DIR, filename);

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
    const sizeBytes = fs.statSync(filepath).size;

    const elapsedMs = Date.now() - startedAt;
    console.log(
      `${LOG_PREFIX} ok (${reason}): ${filename} — ${(sizeBytes / 1024).toFixed(1)} KB ` +
      `(${counts.clients} clientes, ${counts.agencies} agências, ` +
      `${counts.teamMembers} membros, ${counts.broadcasts} comunicados) em ${elapsedMs}ms`
    );

    // Retenção: deixa só os últimos 30
    pruneOldBackups();

    return { filename, filepath, sizeBytes, counts };
  } catch (err) {
    console.error(`${LOG_PREFIX} erro (${reason}): ${err.message}`);
    throw err;
  }
}

/**
 * Registra o cron job no processo. Chamar uma vez no boot do servidor.
 * Respeita BACKUP_ENABLED env var (default true).
 */
function startBackupScheduler() {
  if (process.env.BACKUP_ENABLED === 'false') {
    console.log(`${LOG_PREFIX} desabilitado via BACKUP_ENABLED=false`);
    return null;
  }

  // Todo dia às 03:00 horário de Brasília
  const task = cron.schedule(
    '0 3 * * *',
    () => {
      runBackup('cron-daily').catch((e) => {
        console.error(`${LOG_PREFIX} cron job falhou: ${e.message}`);
      });
    },
    {
      timezone: 'America/Sao_Paulo',
    }
  );

  console.log(`${LOG_PREFIX} agendado: todo dia 03:00 America/Sao_Paulo (retention=${MAX_BACKUPS} backups)`);
  return task;
}

module.exports = {
  startBackupScheduler,
  runBackup,
  BACKUPS_DIR,
  MAX_BACKUPS,
};
