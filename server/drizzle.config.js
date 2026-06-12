require('dotenv').config();
const { defineConfig } = require('drizzle-kit');

/**
 * 100% DRIZZLE — o Drizzle é o ÚNICO dono do schema/migrações.
 *  - `schema` carrega os DOIS arquivos: schema.js (núcleo normalizado) e
 *    schema-bpo.js (tabelas antes geridas pelo Prisma — adotadas pelo Drizzle).
 *  - Use SEMPRE `drizzle-kit generate` (SQL aditivo) + `drizzle-kit migrate`.
 *  - NUNCA use `drizzle-kit push` (sincroniza destruindo — perigo em prod).
 *  - A migração que adota as tabelas legadas usa CREATE ... IF NOT EXISTS, então
 *    é no-op em bancos que já as têm (local/HML vindo de dump do PRD) e cria do
 *    zero num banco virgem.
 */
module.exports = defineConfig({
  dialect: 'postgresql',
  schema: ['./src/db/schema.js', './src/db/schema-bpo.js'],
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL },
});
