/**
 * Schema Drizzle — NÚCLEO NORMALIZADO (refactor JSON → tabelas).
 *
 * Tabelas NOVAS, geridas pelo Drizzle, que convivem ao lado das tabelas do
 * Prisma (Client, Payable, etc.). Drizzle é dono SÓ destas; Prisma continua
 * dono das antigas. Ver docs/refactor-json-para-tabelas.md.
 *
 * Convenções:
 *  - nomes de tabela em PascalCase (igual ao Prisma) — sem colisão com as antigas
 *  - colunas camelCase (igual ao Prisma: "clientId", "createdAt")
 *  - dinheiro em numeric(18,2) — NUNCA string/float
 *  - clientId = text (FK pra "Client" do Prisma, adicionada via SQL na migração)
 *  - legacyId preserva o id antigo do blob, pra remapear referências no backfill
 */
const {
  pgTable, text, boolean, integer, timestamp, numeric, date, jsonb, index, uniqueIndex,
} = require('drizzle-orm/pg-core');
const { sql } = require('drizzle-orm');

// id text com default gerado no banco (compatível com os ids text do Prisma)
const id = () => text('id').primaryKey().default(sql`gen_random_uuid()::text`);
const createdAt = () => timestamp('createdAt', { precision: 3 }).defaultNow().notNull();
const updatedAt = () => timestamp('updatedAt', { precision: 3 }).defaultNow().notNull().$onUpdate(() => new Date());

// ── Insumos ───────────────────────────────────────────────────────────────
const ingredient = pgTable('Ingredient', {
  id: id(),
  clientId: text('clientId').notNull(),
  legacyId: text('legacyId'),
  name: text('name').notNull(),
  category: text('category'),
  unit: text('unit'),                                  // un, kg, L, g, ml
  packPrice: numeric('packPrice', { precision: 18, scale: 2 }),   // preço da embalagem
  packQty: numeric('packQty', { precision: 18, scale: 4 }),       // qtd na embalagem
  unitCost: numeric('unitCost', { precision: 18, scale: 6 }),     // custo unitário derivado
  active: boolean('active').default(true).notNull(),
  isDeleted: boolean('isDeleted').default(false).notNull(),
  deletedAt: timestamp('deletedAt', { precision: 3 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  clientIdx: index('Ingredient_clientId_idx').on(t.clientId),
  legacyIdx: index('Ingredient_legacyId_idx').on(t.clientId, t.legacyId),
}));

// ── Ficha técnica (simples ou modular) ──────────────────────────────────────
const technicalSheet = pgTable('TechnicalSheet', {
  id: id(),
  clientId: text('clientId').notNull(),
  legacyId: text('legacyId'),
  name: text('name').notNull(),
  category: text('category'),
  isModular: boolean('isModular').default(false).notNull(),
  yield: numeric('yield', { precision: 18, scale: 4 }),           // rendimento
  sellingPrice: numeric('sellingPrice', { precision: 18, scale: 2 }),
  totalCost: numeric('totalCost', { precision: 18, scale: 2 }),   // custoTotal (denormalizado)
  costMin: numeric('costMin', { precision: 18, scale: 2 }),       // modular
  costMax: numeric('costMax', { precision: 18, scale: 2 }),       // modular
  active: boolean('active').default(true).notNull(),
  isDeleted: boolean('isDeleted').default(false).notNull(),
  deletedAt: timestamp('deletedAt', { precision: 3 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  clientIdx: index('TechnicalSheet_clientId_idx').on(t.clientId),
  legacyIdx: index('TechnicalSheet_legacyId_idx').on(t.clientId, t.legacyId),
}));

// insumo dentro da ficha simples
const technicalSheetItem = pgTable('TechnicalSheetItem', {
  id: id(),
  sheetId: text('sheetId').notNull().references(() => technicalSheet.id, { onDelete: 'cascade' }),
  ingredientId: text('ingredientId').references(() => ingredient.id, { onDelete: 'set null' }),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
  unit: text('unit'),
  unitCost: numeric('unitCost', { precision: 18, scale: 6 }).notNull(),
  lineCost: numeric('lineCost', { precision: 18, scale: 2 }).notNull(),
}, (t) => ({
  sheetIdx: index('TechnicalSheetItem_sheetId_idx').on(t.sheetId),
}));

// módulo da ficha modular (ex.: "Tamanho", "Borda")
const sheetModule = pgTable('SheetModule', {
  id: id(),
  sheetId: text('sheetId').notNull().references(() => technicalSheet.id, { onDelete: 'cascade' }),
  legacyId: text('legacyId'),
  name: text('name').notNull(),
  required: boolean('required').default(true).notNull(),
}, (t) => ({
  sheetIdx: index('SheetModule_sheetId_idx').on(t.sheetId),
}));

// opção do módulo (custo manual OU ficha vinculada — composição)
const sheetModuleOption = pgTable('SheetModuleOption', {
  id: id(),
  moduleId: text('moduleId').notNull().references(() => sheetModule.id, { onDelete: 'cascade' }),
  legacyId: text('legacyId'),
  name: text('name').notNull(),
  cost: numeric('cost', { precision: 18, scale: 2 }),
  isDefault: boolean('isDefault').default(false).notNull(),
  linkedSheetId: text('linkedSheetId').references(() => technicalSheet.id, { onDelete: 'set null' }),
}, (t) => ({
  moduleIdx: index('SheetModuleOption_moduleId_idx').on(t.moduleId),
}));

// ── Engenharia de cardápio ──────────────────────────────────────────────────
const menuItem = pgTable('MenuItem', {
  id: id(),
  clientId: text('clientId').notNull(),
  sheetId: text('sheetId').references(() => technicalSheet.id, { onDelete: 'set null' }),
  legacyId: text('legacyId'),
  name: text('name').notNull(),
  category: text('category'),
  salesEstimate: numeric('salesEstimate', { precision: 18, scale: 2 }),  // "sales" (média estimada)
  price: numeric('price', { precision: 18, scale: 2 }),
  cost: numeric('cost', { precision: 18, scale: 2 }),
  isDeleted: boolean('isDeleted').default(false).notNull(),
  deletedAt: timestamp('deletedAt', { precision: 3 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  clientIdx: index('MenuItem_clientId_idx').on(t.clientId),
}));

// ── Faturamento ─────────────────────────────────────────────────────────────
const revenueEntry = pgTable('RevenueEntry', {     // mensal (revenue_history)
  id: id(),
  clientId: text('clientId').notNull(),
  year: integer('year').notNull(),
  month: integer('month').notNull(),               // 1-12
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  source: text('source').default('onboarding').notNull(),  // onboarding | integration
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  uniq: uniqueIndex('RevenueEntry_client_year_month_uq').on(t.clientId, t.year, t.month),
}));

const dailyRevenue = pgTable('DailyRevenue', {     // diário (daily_revenue)
  id: id(),
  clientId: text('clientId').notNull(),
  date: date('date').notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  source: text('source').default('manual').notNull(),
  createdAt: createdAt(),
}, (t) => ({
  uniq: uniqueIndex('DailyRevenue_client_date_uq').on(t.clientId, t.date),
}));

// ── Company profile (1:1 with Client) ──────────────────────────────────────
const companyProfile = pgTable('CompanyProfile', {
  id: id(),
  clientId: text('clientId').notNull(),
  restaurantName: text('restaurantName'),
  restaurantCategory: text('restaurantCategory'),
  taxRegime: text('taxRegime'),                 // 'Simples Nacional' | 'Lucro Presumido' | ...
  isMei: boolean('isMei').default(false).notNull(),
  simplesRate: numeric('simplesRate', { precision: 5, scale: 2 }),
  rentMonthly: numeric('rentMonthly', { precision: 18, scale: 2 }),
  iptuAnnual: numeric('iptuAnnual', { precision: 18, scale: 2 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  clientUq: uniqueIndex('CompanyProfile_clientId_uq').on(t.clientId),
}));

// ── Fixed cost items (generic recurring costs) ──────────────────────────────
// Absorve utilities/recurring/operational/admin/marketing/monthly_service/other
// num só lugar (group+key+amount) em vez de uma tabela por grupo.
const fixedCostItem = pgTable('FixedCostItem', {
  id: id(),
  clientId: text('clientId').notNull(),
  legacyId: text('legacyId'),
  costGroup: text('costGroup').notNull(),   // utilities|recurring|operational|admin|marketing|monthly_service|other|location
  costKey: text('costKey'),                 // energy|water|pest_control|software_pdv|agency|rent|...
  label: text('label'),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  clientGroupIdx: index('FixedCostItem_client_group_idx').on(t.clientId, t.costGroup),
}));

// ── Payroll employees (cost model do onboarding) ────────────────────────────
// Distinto de BpoEmployee (Prisma) — avaliar unificação na F1.
const employee = pgTable('Employee', {
  id: id(),
  clientId: text('clientId').notNull(),
  legacyId: text('legacyId'),
  name: text('name'),
  regime: text('regime'),                   // CLT | PJ | Freela
  baseSalary: numeric('baseSalary', { precision: 18, scale: 2 }),
  bonus: numeric('bonus', { precision: 18, scale: 2 }),         // "premio"
  transportValue: numeric('transportValue', { precision: 18, scale: 2 }),
  transportQty: integer('transportQty'),
  workDays: integer('workDays'),
  foodCost: numeric('foodCost', { precision: 18, scale: 2 }),
  active: boolean('active').default(true).notNull(),
  isDeleted: boolean('isDeleted').default(false).notNull(),
  deletedAt: timestamp('deletedAt', { precision: 3 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  clientIdx: index('Employee_clientId_idx').on(t.clientId),
}));

// ── Partners (pró-labore) ───────────────────────────────────────────────────
const partner = pgTable('Partner', {
  id: id(),
  clientId: text('clientId').notNull(),
  legacyId: text('legacyId'),
  name: text('name'),
  proLabore: numeric('proLabore', { precision: 18, scale: 2 }),
  personalAccountBank: text('personalAccountBank'),
  personalAccountAgency: text('personalAccountAgency'),
  personalAccountNumber: text('personalAccountNumber'),
  active: boolean('active').default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  clientIdx: index('Partner_clientId_idx').on(t.clientId),
}));

// ── Equipment (depreciation) ────────────────────────────────────────────────
const equipment = pgTable('Equipment', {
  id: id(),
  clientId: text('clientId').notNull(),
  legacyId: text('legacyId'),
  name: text('name'),
  value: numeric('value', { precision: 18, scale: 2 }),
  lifespanYears: numeric('lifespanYears', { precision: 5, scale: 2 }).default('5'),
  active: boolean('active').default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  clientIdx: index('Equipment_clientId_idx').on(t.clientId),
}));

// ── Vehicles (fleet) ────────────────────────────────────────────────────────
const vehicle = pgTable('Vehicle', {
  id: id(),
  clientId: text('clientId').notNull(),
  legacyId: text('legacyId'),
  description: text('description'),
  installment: numeric('installment', { precision: 18, scale: 2 }),
  maintenanceMonthly: numeric('maintenanceMonthly', { precision: 18, scale: 2 }),
  insuranceAnnual: numeric('insuranceAnnual', { precision: 18, scale: 2 }),
  ipvaAnnual: numeric('ipvaAnnual', { precision: 18, scale: 2 }),
  active: boolean('active').default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  clientIdx: index('Vehicle_clientId_idx').on(t.clientId),
}));

// ── Card machines (fees_cards) ──────────────────────────────────────────────
const cardMachine = pgTable('CardMachine', {
  id: id(),
  clientId: text('clientId').notNull(),
  legacyId: text('legacyId'),
  provider: text('provider'),
  debitRate: numeric('debitRate', { precision: 5, scale: 2 }),
  creditRate: numeric('creditRate', { precision: 5, scale: 2 }),
  active: boolean('active').default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  clientIdx: index('CardMachine_clientId_idx').on(t.clientId),
}));

// ── Marketplaces (fees_marketplaces — iFood, Rappi, …) ──────────────────────
const marketplace = pgTable('Marketplace', {
  id: id(),
  clientId: text('clientId').notNull(),
  legacyId: text('legacyId'),
  provider: text('provider'),
  customProvider: text('customProvider'),
  commission: numeric('commission', { precision: 5, scale: 2 }),
  salesPercentage: numeric('salesPercentage', { precision: 5, scale: 2 }),
  monthlyFee: numeric('monthlyFee', { precision: 18, scale: 2 }),
  active: boolean('active').default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  clientIdx: index('Marketplace_clientId_idx').on(t.clientId),
}));

// ── Metric snapshots (metric_snapshots por YYYY-MM) ─────────────────────────
const metricSnapshot = pgTable('MetricSnapshot', {
  id: id(),
  clientId: text('clientId').notNull(),
  periodKey: text('periodKey').notNull(),    // 'YYYY-MM'
  drivers: jsonb('drivers'),                 // { cmv, fixedCostPct, cardFeePct, breakEvenExcess }
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  uq: uniqueIndex('MetricSnapshot_client_period_uq').on(t.clientId, t.periodKey),
}));

module.exports = {
  // catálogo + fichas + menu + faturamento (0000)
  ingredient,
  technicalSheet,
  technicalSheetItem,
  sheetModule,
  sheetModuleOption,
  menuItem,
  revenueEntry,
  dailyRevenue,
  // custos + onboarding (0001)
  companyProfile,
  fixedCostItem,
  employee,
  partner,
  equipment,
  vehicle,
  cardMachine,
  marketplace,
  metricSnapshot,
};
