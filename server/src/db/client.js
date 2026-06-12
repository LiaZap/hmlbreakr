/**
 * Client Drizzle (núcleo normalizado). Convive com o PrismaClient existente —
 * ambos falam com o MESMO Postgres. Drizzle só conhece as tabelas novas
 * (server/src/db/schema.js); Prisma continua dono das antigas.
 */
// IMPORTANTE: carregar o .env ANTES de criar o Pool. O Pool lê DATABASE_URL no
// momento da construção (require-time). Como este módulo é o primeiro require do
// index.js — e o dotenv.config() do index roda só depois dos requires — sem isto
// o Pool nasceria sem connectionString (erro "SASL: password must be a string").
// O Prisma mascarava isso (lê DATABASE_URL lazy e carrega o .env por conta). Path
// explícito (../../.env = server/.env) garante funcionar em qualquer cwd. dotenv
// não sobrescreve vars já definidas, então é seguro chamar aqui e no index.js.
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');
const schema = require('./schema');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const db = drizzle(pool, { schema });

module.exports = { db, pool, schema };
