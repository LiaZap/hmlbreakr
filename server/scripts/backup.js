/**
 * BREAKR DATABASE BACKUP SCRIPT (CLI)
 *
 * Wrapper CLI em volta de runBackup() do backupScheduler service.
 * A lógica real vive em src/services/backupScheduler.js (DRY).
 *
 * Usage: node scripts/backup.js
 * Output: server/backups/backup-auto-YYYY-MM-DD.json
 */

const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { runBackup } = require('../src/services/backupScheduler');

(async () => {
  console.log('🔄 Iniciando backup do banco de dados Breakr...\n');
  try {
    const { filename, filepath, sizeBytes, counts } = await runBackup('manual-cli');

    console.log('✅ Backup concluído!\n');
    console.log(`📁 Arquivo: ${filepath}`);
    console.log(`📊 Resumo:`);
    console.log(`   • ${counts.clients} clientes`);
    console.log(`   • ${counts.agencies} agências`);
    console.log(`   • ${counts.teamMembers} membros de equipe`);
    console.log(`   • ${counts.broadcasts} comunicados`);
    console.log(`   • Tamanho: ${(sizeBytes / 1024).toFixed(1)} KB`);
    console.log(`\n💡 Para restaurar, use: node scripts/restore.js ${filename}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro no backup:', error.message);
    process.exit(1);
  }
})();
