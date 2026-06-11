require('dotenv').config();
const { defineConfig } = require('drizzle-kit');

/**
 * IMPORTANTE — CONVIVÊNCIA COM PRISMA:
 *  - Use SEMPRE `drizzle-kit generate` (cria SQL aditivo) + `drizzle-kit migrate`.
 *  - NUNCA use `drizzle-kit push` — ele sincroniza o schema e tentaria DROPAR
 *    as tabelas do Prisma (que não estão neste schema). PERIGO.
 *  - Drizzle versiona as próprias migrações em `__drizzle_migrations`
 *    (separado do `_prisma_migrations`).
 */
module.exports = defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.js',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL },
  // tablesFilter evita que o introspect/diff toque nas tabelas do Prisma
  tablesFilter: [
    'Ingredient', 'TechnicalSheet', 'TechnicalSheetItem', 'SheetModule',
    'SheetModuleOption', 'MenuItem', 'RevenueEntry', 'DailyRevenue',
    'CompanyProfile', 'FixedCostItem', 'Employee', 'Partner', 'Equipment',
    'Vehicle', 'CardMachine', 'Marketplace', 'MetricSnapshot',
    '__drizzle_migrations',
  ],
});
