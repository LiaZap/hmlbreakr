/**
 * BREAKR DATABASE BACKUP SCRIPT
 *
 * Exports all data (Clients, Agencies, TeamMembers, Broadcasts)
 * to a JSON file for migration to a new server.
 *
 * Usage: node scripts/backup.js
 * Output: backup-YYYY-MM-DD-HHmmss.json in the server/ folder
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function backup() {
  console.log('🔄 Iniciando backup do banco de dados Breakr...\n');

  try {
    // Export all tables
    const [clients, agencies, teamMembers, broadcasts] = await Promise.all([
      prisma.client.findMany(),
      prisma.agency.findMany(),
      prisma.teamMember.findMany(),
      prisma.broadcast.findMany(),
    ]);

    const data = {
      _meta: {
        version: '1.2',
        exportedAt: new Date().toISOString(),
        source: process.env.DATABASE_URL?.replace(/:[^:]*@/, ':***@') || 'unknown', // hide password
        counts: {
          clients: clients.length,
          agencies: agencies.length,
          teamMembers: teamMembers.length,
          broadcasts: broadcasts.length,
        }
      },
      clients,
      agencies,
      teamMembers,
      broadcasts,
    };

    // Generate filename with timestamp
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `backup-${ts}.json`;
    const filepath = path.resolve(__dirname, '..', filename);

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');

    console.log('✅ Backup concluído!\n');
    console.log(`📁 Arquivo: ${filepath}`);
    console.log(`📊 Resumo:`);
    console.log(`   • ${clients.length} clientes`);
    console.log(`   • ${agencies.length} agências`);
    console.log(`   • ${teamMembers.length} membros de equipe`);
    console.log(`   • ${broadcasts.length} comunicados`);
    console.log(`   • Tamanho: ${(fs.statSync(filepath).size / 1024).toFixed(1)} KB`);
    console.log(`\n💡 Para restaurar, use: node scripts/restore.js ${filename}`);

  } catch (error) {
    console.error('❌ Erro no backup:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

backup();
