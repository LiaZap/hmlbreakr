/**
 * BREAKR DATABASE RESTORE SCRIPT
 *
 * Restores data from a backup JSON file into a fresh database.
 * Run drizzle migrations BEFORE running this script.
 *
 * Usage:
 *   1. Set DATABASE_URL in .env to the NEW database
 *   2. Run the drizzle migrations
 *   3. Run: node scripts/restore.js backup-2026-04-16T12-00-00.json
 *
 * ⚠️ WARNING: This will INSERT data. Run on an EMPTY database only.
 */

const { db, pool } = require('../src/db/client');
const t = require('../src/db/schema-bpo');
const { count } = require('drizzle-orm');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function restore() {
  const backupFile = process.argv[2];

  if (!backupFile) {
    console.error('❌ Uso: node scripts/restore.js <arquivo-backup.json>');
    console.error('   Exemplo: node scripts/restore.js backup-2026-04-16T12-00-00.json');
    process.exit(1);
  }

  const filepath = path.resolve(__dirname, '..', backupFile);

  if (!fs.existsSync(filepath)) {
    console.error(`❌ Arquivo não encontrado: ${filepath}`);
    process.exit(1);
  }

  console.log(`🔄 Restaurando backup de: ${backupFile}\n`);

  try {
    const raw = fs.readFileSync(filepath, 'utf-8');
    const data = JSON.parse(raw);

    if (data._meta) {
      console.log(`📋 Backup de: ${data._meta.exportedAt}`);
      console.log(`   Clientes: ${data._meta.counts.clients}`);
      console.log(`   Agências: ${data._meta.counts.agencies}`);
      console.log(`   Team Members: ${data._meta.counts.teamMembers}`);
      console.log(`   Broadcasts: ${data._meta.counts.broadcasts}`);
      console.log('');
    }

    // Check if database is empty
    const [{ value: existingClients }] = await db.select({ value: count() }).from(t.client);
    if (Number(existingClients) > 0) {
      console.warn(`⚠️  O banco já tem ${Number(existingClients)} clientes!`);
      console.warn('   O restore vai ADICIONAR os dados. Dados duplicados podem causar erros.');
      console.warn('   Para continuar, pressione Ctrl+C para cancelar ou aguarde 5 segundos...\n');
      await new Promise(r => setTimeout(r, 5000));
    }

    // 1. Restore Agencies first (clients reference agencies)
    if (data.agencies?.length > 0) {
      console.log(`📥 Restaurando ${data.agencies.length} agências...`);
      for (const agency of data.agencies) {
        try {
          await db.insert(t.agency).values({
            id: agency.id,
            name: agency.name,
            hash: agency.hash,
            email: agency.email,
            password: agency.password,
            resetToken: agency.resetToken,
            resetTokenAt: agency.resetTokenAt ? new Date(agency.resetTokenAt) : null,
            stripeCustomerId: agency.stripeCustomerId,
            stripeSubscriptionId: agency.stripeSubscriptionId,
            plan: agency.plan || 'basic',
            active: agency.active ?? false,
            createdAt: new Date(agency.createdAt),
          }).returning();
        } catch (err) {
          console.warn(`   ⚠️ Agência "${agency.name}" falhou: ${err.message}`);
        }
      }
    }

    // 2. Restore Clients
    if (data.clients?.length > 0) {
      console.log(`📥 Restaurando ${data.clients.length} clientes...`);
      for (const client of data.clients) {
        try {
          await db.insert(t.client).values({
            id: client.id,
            name: client.name,
            hash: client.hash,
            email: client.email,
            password: client.password,
            resetToken: client.resetToken,
            resetTokenAt: client.resetTokenAt ? new Date(client.resetTokenAt) : null,
            clerkUserId: client.clerkUserId,
            stripeCustomerId: client.stripeCustomerId,
            stripeSubscriptionId: client.stripeSubscriptionId,
            active: client.active ?? true,
            agencyId: client.agencyId,
            data: typeof client.data === 'string' ? client.data : JSON.stringify(client.data),
            createdAt: new Date(client.createdAt),
            updatedAt: new Date(client.updatedAt),
          }).returning();
        } catch (err) {
          console.warn(`   ⚠️ Cliente "${client.name}" falhou: ${err.message}`);
        }
      }
    }

    // 3. Restore TeamMembers
    if (data.teamMembers?.length > 0) {
      console.log(`📥 Restaurando ${data.teamMembers.length} membros de equipe...`);
      for (const tm of data.teamMembers) {
        try {
          await db.insert(t.teamMember).values({
            id: tm.id,
            name: tm.name,
            hash: tm.hash,
            email: tm.email,
            password: tm.password,
            role: tm.role || 'Gerente',
            clientId: tm.clientId,
            createdAt: new Date(tm.createdAt),
          }).returning();
        } catch (err) {
          console.warn(`   ⚠️ TeamMember "${tm.name}" falhou: ${err.message}`);
        }
      }
    }

    // 4. Restore Broadcasts
    if (data.broadcasts?.length > 0) {
      console.log(`📥 Restaurando ${data.broadcasts.length} comunicados...`);
      for (const b of data.broadcasts) {
        try {
          await db.insert(t.broadcast).values({
            id: b.id,
            title: b.title,
            message: b.message,
            imageUrl: b.imageUrl,
            type: b.type || 'popup',
            active: b.active ?? true,
            targetCategory: b.targetCategory,
            createdAt: new Date(b.createdAt),
            expiresAt: b.expiresAt ? new Date(b.expiresAt) : null,
          }).returning();
        } catch (err) {
          console.warn(`   ⚠️ Broadcast "${b.title}" falhou: ${err.message}`);
        }
      }
    }

    // Verify
    const counts = await Promise.all([
      db.select({ value: count() }).from(t.client),
      db.select({ value: count() }).from(t.agency),
      db.select({ value: count() }).from(t.teamMember),
      db.select({ value: count() }).from(t.broadcast),
    ]);

    console.log('\n✅ Restore concluído!\n');
    console.log('📊 Verificação:');
    console.log(`   • ${Number(counts[0][0].value)} clientes no banco`);
    console.log(`   • ${Number(counts[1][0].value)} agências no banco`);
    console.log(`   • ${Number(counts[2][0].value)} membros de equipe no banco`);
    console.log(`   • ${Number(counts[3][0].value)} comunicados no banco`);

  } catch (error) {
    console.error('❌ Erro no restore:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

restore();
