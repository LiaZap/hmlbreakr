/**
 * Client Drizzle (núcleo normalizado). Convive com o PrismaClient existente —
 * ambos falam com o MESMO Postgres. Drizzle só conhece as tabelas novas
 * (server/src/db/schema.js); Prisma continua dono das antigas.
 */
const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');
const schema = require('./schema');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const db = drizzle(pool, { schema });

module.exports = { db, pool, schema };
