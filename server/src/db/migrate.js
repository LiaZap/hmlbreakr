/**
 * Aplica as migrações Drizzle pendentes (server/drizzle/*.sql) usando o migrator
 * RUNTIME do drizzle-orm — NÃO depende do drizzle-kit (devDependency). Idempotente:
 * o estado é rastreado em drizzle.__drizzle_migrations, só aplica o que falta.
 *
 * Rodado no `npm start` ANTES de subir o app (sem Prisma — 100% Drizzle).
 *
 * BOOTSTRAP (banco VAZIO): as migrações do núcleo (0000…) criam tabelas com FK
 * para a tabela legada `Client`, que só é criada na migração `adopt_legacy`
 * (0009). Em banco já populado (local / HML vindo de dump do PRD) isso funciona
 * porque `Client` já existe; mas num banco VAZIO a 0000 falharia (FK -> tabela
 * inexistente). Então, ANTES do migrate normal, rodamos o SQL de adoção das
 * tabelas legadas (CREATE TABLE IF NOT EXISTS — idempotente): garante `Client` e
 * as demais legadas existirem, sem efeito em bancos que já as têm.
 *
 * Tracking: schema 'drizzle', tabela '__drizzle_migrations'.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('[drizzle migrate] DATABASE_URL ausente — abortando');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  const migrationsFolder = path.resolve(__dirname, '../../drizzle');
  try {
    // BOOTSTRAP idempotente das tabelas legadas (adopt_legacy*.sql) — garante que
    // `Client` & cia. existam antes das migrações do núcleo que têm FK -> Client.
    const legacy = fs.readdirSync(migrationsFolder)
      .filter((f) => /adopt_legacy.*\.sql$/i.test(f))
      .sort();
    for (const f of legacy) {
      const sql = fs.readFileSync(path.join(migrationsFolder, f), 'utf8')
        .split('--> statement-breakpoint').join('\n');
      console.log(`[drizzle migrate] bootstrap das tabelas legadas (${f})`);
      await pool.query(sql);
    }

    console.log('[drizzle migrate] aplicando migrações pendentes de', migrationsFolder);
    await migrate(db, { migrationsFolder, migrationsSchema: 'drizzle' });
    console.log('[drizzle migrate] OK — schema Drizzle em dia');
    await pool.end().catch(() => {});
    process.exit(0);
  } catch (err) {
    console.error('[drizzle migrate] FALHOU:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }
})();
