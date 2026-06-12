/**
 * Aplica as migrações Drizzle pendentes (server/drizzle/*.sql) usando o migrator
 * RUNTIME do drizzle-orm — NÃO depende do drizzle-kit (que é devDependency e some
 * num `npm install --production`). Idempotente: o estado é rastreado em
 * drizzle.__drizzle_migrations, então só aplica o que falta.
 *
 * Rodado no `npm start` ANTES de subir o app, logo após `prisma migrate deploy`.
 * Assim o deploy cria/atualiza tanto as tabelas geridas pelo Prisma quanto as
 * tabelas normalizadas do Drizzle (Category, Ingredient, fichas, etc.).
 *
 * Tracking: schema 'drizzle', tabela '__drizzle_migrations' — mesmo default do
 * drizzle-kit que gerou o estado local (confirmado: 9 migrações aplicadas).
 * Carrega o .env antes de criar o Pool (mesma razão de db/client.js).
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
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
