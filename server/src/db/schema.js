/**
 * Schema Drizzle — NÚCLEO NORMALIZADO (refactor JSON → tabelas).
 *
 * Tabelas NOVAS, geridas pelo Drizzle, que convivem ao lado das tabelas do
 * Prisma (Client, Payable, etc.). Drizzle é dono SÓ destas; Prisma continua
 * dono das antigas. Ver docs/refactor-json-para-tabelas.md e a F0.5 em
 * docs/plano-migracao-castelo-de-areia.md.
 *
 * Convenções:
 *  - nomes de tabela em PascalCase (igual ao Prisma) — sem colisão com as antigas
 *  - colunas camelCase (igual ao Prisma: "clientId", "createdAt")
 *  - dinheiro em numeric(18,2) — NUNCA string/float
 *  - clientId = text (FK pra "Client" do Prisma, adicionada via SQL na migração)
 *  - legacyId preserva o id antigo do blob, pra remapear referências no backfill
 *
 * FKs CROSS-ORM (invisíveis ao snapshot do Drizzle): clientId→Client,
 * bpoEmployeeId→BpoEmployee, bpoPartnerId→BpoPartner,
 * {debit,credit}PaymentMethodId/paymentMethodId→PaymentMethod são adicionadas
 * via SQL bruto APPENDADO na migração (Client, Bpo... e PaymentMethod são do Prisma).
 * NUNCA declare essas com .references() aqui — o generate duplicaria a constraint.
 * Só categoryId→Category é intra-Drizzle (declarada com .references()).
 *
 * Auditoria/soft-delete (regras da base): TODA tabela leva created/updated +
 * modifiedBy. Entidades editáveis (TIER 1) levam soft delete (isDeleted/
 * deletedAt/deletedBy). FATOS append-only/mutáveis (TIER 2: faturamento,
 * snapshots) NÃO levam soft delete (colidiria com o unique de período).
 * FILHOS de agregado (TIER 3: itens/módulos/opções/passos da ficha) usam
 * DELETE FÍSICO dentro do update da ficha-raiz auditada — sem isDeleted.
 */
const {
  pgTable, text, boolean, integer, timestamp, numeric, date, jsonb, index, uniqueIndex,
} = require('drizzle-orm/pg-core');
const { sql } = require('drizzle-orm');

// id text com default gerado no banco (compatível com os ids text do Prisma)
const id = () => text('id').primaryKey().default(sql`gen_random_uuid()::text`);
const createdAt = () => timestamp('createdAt', { precision: 3 }).defaultNow().notNull();
const updatedAt = () => timestamp('updatedAt', { precision: 3 }).defaultNow().notNull().$onUpdate(() => new Date());
// timestamp nullable genérico, mesma precision dos helpers (evita diff espúrio no generate)
const ts = (name) => timestamp(name, { precision: 3 });

// blocos reutilizáveis (spread no objeto da tabela) ───────────────────────────
// audit(): relógio TÉCNICO de gravação + autoria. updatedAt é token de
// optimistic locking (server actions comparam no .where) — NÃO é "data de
// edição do usuário" (essa vai em colunas sourceUpdatedAt próprias).
const audit = () => ({ createdAt: createdAt(), updatedAt: updatedAt(), modifiedBy: text('modifiedBy') });
// soft(): delete lógico — só em entidades editáveis (TIER 1).
const soft = () => ({
  isDeleted: boolean('isDeleted').default(false).notNull(),
  deletedAt: ts('deletedAt'),
  deletedBy: text('deletedBy'),
});

// ── Categorias (catálogo por cliente; antes string solta no blob) ───────────
// scope: 'ingredient' (op.categories.insumos) | 'sheet' (op.categories.fichas)
//        | 'menu' (distinct de menuEngineering[].category — sem fonte em
//        op.categories, populado só pelos usados). categoryId é a FONTE DA
//        VERDADE; a coluna `category` (text) nas 3 tabelas é cache de label.
const category = pgTable('Category', {
  id: id(),
  clientId: text('clientId').notNull(),       // FK→Client RESTRICT (SQL bruto)
  name: text('name').notNull(),
  scope: text('scope').notNull(),             // ingredient | sheet | menu
  color: text('color'),
  isSystem: boolean('isSystem').default(false).notNull(),  // default do app x custom do cliente
  active: boolean('active').default(true).notNull(),
  ...soft(),
  ...audit(),
}, (t) => ({
  clientIdx: index('Category_clientId_idx').on(t.clientId),
  // idempotência do backfill + integridade: 1 nome por (cliente, escopo) vivo.
  // PARCIAL (WHERE isDeleted=false) pra permitir reusar nome após soft-delete.
  uq: uniqueIndex('Category_client_scope_name_uq').on(t.clientId, t.scope, t.name).where(sql`"isDeleted" = false`),
}));

// ── Insumos ───────────────────────────────────────────────────────────────
const ingredient = pgTable('Ingredient', {
  id: id(),
  clientId: text('clientId').notNull(),
  legacyId: text('legacyId'),
  categoryId: text('categoryId').references(() => category.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  category: text('category'),                           // label denormalizado (cache; verdade = categoryId)
  unit: text('unit'),                                  // un, kg, L, g, ml
  packUnit: text('packUnit'),                          // ← purchaseUnit (unidade que casa com packQty)
  packPrice: numeric('packPrice', { precision: 18, scale: 2 }),   // ← purchaseTotal (preço da embalagem)
  packQty: numeric('packQty', { precision: 18, scale: 4 }),       // ← purchaseQty (qtd na embalagem)
  unitCost: numeric('unitCost', { precision: 18, scale: 6 }),     // ← custo (custo unitário derivado)
  price: numeric('price', { precision: 18, scale: 6 }),           // ← price (preço unitário alternativo)
  refQty: numeric('refQty', { precision: 18, scale: 4 }),         // ← qty (qtd de referência)
  defaultQty: numeric('defaultQty', { precision: 18, scale: 4 }), // ← defaultQty
  grossQty: numeric('grossQty', { precision: 18, scale: 4 }),     // ← grossQty
  yield: numeric('yield', { precision: 18, scale: 4 }),           // ← rendimento (parte numérica de "1000kg")
  yieldUnit: text('yieldUnit'),                        // ← rendimento (parte de unidade de "1000kg")
  isPrepared: boolean('isPrepared').default(false).notNull(),     // ← isPrepared (insumo preparado/sub-receita)
  preparedYield: numeric('preparedYield', { precision: 18, scale: 4 }),  // ← rendimentoPreparado
  preparedYieldUnit: text('preparedYieldUnit'),        // ← rendimentoUnit
  preparedTotalCost: numeric('preparedTotalCost', { precision: 18, scale: 4 }),  // ← totalCost da sub-receita
  sourceUpdatedAt: ts('sourceUpdatedAt'),              // ← lastUpdated (epoch) data real de edição
  active: boolean('active').default(true).notNull(),
  ...soft(),
  ...audit(),
}, (t) => ({
  clientIdx: index('Ingredient_clientId_idx').on(t.clientId),
  categoryIdx: index('Ingredient_categoryId_idx').on(t.categoryId),
  legacyUq: uniqueIndex('Ingredient_client_legacy_uq').on(t.clientId, t.legacyId).where(sql`"legacyId" is not null`),
}));

// Componente da sub-receita do insumo preparado (isPrepared=true). Árvore
// recursiva (subIngredients aninhados): parentComponentId aponta pro componente
// pai (self-FK adicionada via SQL bruto). FILHO de agregado — delete físico.
const ingredientComponent = pgTable('IngredientComponent', {
  id: id(),
  // raiz polimórfica: pertence a um insumo preparado OU a um item de ficha preparado (exatamente um)
  ingredientId: text('ingredientId').references(() => ingredient.id, { onDelete: 'cascade' }),
  technicalSheetItemId: text('technicalSheetItemId').references(() => technicalSheetItem.id, { onDelete: 'cascade' }),
  parentComponentId: text('parentComponentId'),        // self-FK (nível aninhado) — SQL bruto
  componentIngredientId: text('componentIngredientId').references(() => ingredient.id, { onDelete: 'set null' }),  // link ao insumo base, se existir
  legacyId: text('legacyId'),
  name: text('name').notNull(),
  category: text('category'),
  qty: numeric('qty', { precision: 18, scale: 4 }),            // ← qty (usado na receita)
  unit: text('unit'),
  unitCost: numeric('unitCost', { precision: 18, scale: 6 }),   // ← price
  lineCost: numeric('lineCost', { precision: 18, scale: 2 }),   // ← custo
  // snapshot completo do sub (o blob denormaliza o insumo dentro da sub-receita)
  packUnit: text('packUnit'),                                  // ← purchaseUnit
  packPrice: numeric('packPrice', { precision: 18, scale: 2 }), // ← purchaseTotal
  packQty: numeric('packQty', { precision: 18, scale: 4 }),     // ← purchaseQty
  defaultQty: numeric('defaultQty', { precision: 18, scale: 4 }),
  grossQty: numeric('grossQty', { precision: 18, scale: 4 }),
  netQty: numeric('netQty', { precision: 18, scale: 4 }),
  correctionFactor: numeric('correctionFactor', { precision: 10, scale: 4 }),  // ← fc
  usageUnit: text('usageUnit'),
  originalUnit: text('originalUnit'),
  yield: numeric('yield', { precision: 18, scale: 4 }),        // ← rendimento (parte numérica)
  yieldUnit: text('yieldUnit'),                                // ← rendimento (unidade)
  preparedYield: numeric('preparedYield', { precision: 18, scale: 4 }),     // sub aninhado preparado
  preparedYieldUnit: text('preparedYieldUnit'),
  preparedTotalCost: numeric('preparedTotalCost', { precision: 18, scale: 4 }),
  sourceUpdatedAt: ts('sourceUpdatedAt'),                      // ← lastUpdated (epoch)
  isPrepared: boolean('isPrepared').default(false).notNull(),
  position: integer('position'),
  ...audit(),
}, (t) => ({
  ingIdx: index('IngredientComponent_ingredientId_idx').on(t.ingredientId),
  itemIdx: index('IngredientComponent_technicalSheetItemId_idx').on(t.technicalSheetItemId),
  parentIdx: index('IngredientComponent_parentComponentId_idx').on(t.parentComponentId),
}));

// ── Ficha técnica (simples ou modular) ──────────────────────────────────────
const technicalSheet = pgTable('TechnicalSheet', {
  id: id(),
  clientId: text('clientId').notNull(),
  legacyId: text('legacyId'),
  categoryId: text('categoryId').references(() => category.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  category: text('category'),                          // label denormalizado (← type)
  isModular: boolean('isModular').default(false).notNull(),
  yield: numeric('yield', { precision: 18, scale: 4 }),           // rendimento (parte numérica)
  yieldUnit: text('yieldUnit'),                        // ← rendimento (unidade, ex "gr")
  sellingPrice: numeric('sellingPrice', { precision: 18, scale: 2 }),  // ← precoVenda
  totalCost: numeric('totalCost', { precision: 18, scale: 2 }),   // ← custoTotal (denormalizado)
  costIngredients: numeric('costIngredients', { precision: 18, scale: 2 }),  // ← custoInsumos
  costPackaging: numeric('costPackaging', { precision: 18, scale: 2 }),      // ← custoEmbalagem
  costMin: numeric('costMin', { precision: 18, scale: 2 }),       // modular
  costMax: numeric('costMax', { precision: 18, scale: 2 }),       // modular
  salesEstimateMonthly: numeric('salesEstimateMonthly', { precision: 18, scale: 2 }),  // ← vendasMes
  prepTimeMinutes: integer('prepTimeMinutes'),         // ← tempoPreparo (parte numérica, p/ query)
  prepTime: text('prepTime'),                          // ← tempoPreparo (texto cru, ex "5 min" — fidelidade)
  utensils: text('utensils'),                          // ← utensilios
  finishing: text('finishing'),                        // ← finalizacao
  dishPhoto: text('dishPhoto'),                        // ← fotoPrato (URL; base64 fica no blob — ver F0.5)
  isImported: boolean('isImported').default(false).notNull(),    // ← isImported
  progress: integer('progress'),                       // ← progress
  sourceCreatedAt: ts('sourceCreatedAt'),              // ← createdAt (epoch) do blob
  sourceUpdatedAt: ts('sourceUpdatedAt'),              // ← lastUpdated (epoch) — card "Fichas Desatualizadas"
  active: boolean('active').default(true).notNull(),
  ...soft(),
  ...audit(),
}, (t) => ({
  clientIdx: index('TechnicalSheet_clientId_idx').on(t.clientId),
  categoryIdx: index('TechnicalSheet_categoryId_idx').on(t.categoryId),
  legacyUq: uniqueIndex('TechnicalSheet_client_legacy_uq').on(t.clientId, t.legacyId).where(sql`"legacyId" is not null`),
}));

// insumo dentro da ficha simples (FILHO de agregado — delete físico)
const technicalSheetItem = pgTable('TechnicalSheetItem', {
  id: id(),
  sheetId: text('sheetId').notNull().references(() => technicalSheet.id, { onDelete: 'cascade' }),
  ingredientId: text('ingredientId').references(() => ingredient.id, { onDelete: 'set null' }),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),  // ← qty
  unit: text('unit'),
  unitCost: numeric('unitCost', { precision: 18, scale: 6 }).notNull(),  // ← price
  lineCost: numeric('lineCost', { precision: 18, scale: 6 }).notNull(),  // ← custo (6 casas: blob tem "R$ 0,675")
  // metadados de conversão (reconstroem o custo sem reprocessar)
  defaultQty: numeric('defaultQty', { precision: 18, scale: 4 }),  // ← defaultQty
  grossQty: numeric('grossQty', { precision: 18, scale: 4 }),      // ← grossQty
  netQty: numeric('netQty', { precision: 18, scale: 4 }),          // ← netQty
  correctionFactor: numeric('correctionFactor', { precision: 10, scale: 4 }),  // ← fc (fator de correção)
  usageUnit: text('usageUnit'),                        // ← usageUnit
  purchaseUnit: text('purchaseUnit'),                  // ← purchaseUnit
  originalUnit: text('originalUnit'),                  // ← originalUnit
  // snapshot completo do item (o item é um insumo denormalizado + uso; pode divergir do insumo base)
  legacyId: text('legacyId'),                          // ← id do item no blob (estável)
  category: text('category'),                          // ← category
  purchaseQty: numeric('purchaseQty', { precision: 18, scale: 4 }),    // ← purchaseQty
  purchaseTotal: numeric('purchaseTotal', { precision: 18, scale: 2 }), // ← purchaseTotal
  yield: numeric('yield', { precision: 18, scale: 4 }),               // ← rendimento (num)
  yieldUnit: text('yieldUnit'),                        // ← rendimento (unidade)
  isPrepared: boolean('isPrepared').default(false).notNull(),
  preparedYield: numeric('preparedYield', { precision: 18, scale: 4 }),     // ← rendimentoPreparado
  preparedYieldUnit: text('preparedYieldUnit'),        // ← rendimentoUnit
  preparedTotalCost: numeric('preparedTotalCost', { precision: 18, scale: 4 }),  // ← totalCost
  sourceUpdatedAt: ts('sourceUpdatedAt'),              // ← lastUpdated (epoch)
  ...audit(),
}, (t) => ({
  sheetIdx: index('TechnicalSheetItem_sheetId_idx').on(t.sheetId),
}));

// passo do modo de preparo (FILHO de agregado — antes operational.fichas[].modoPreparo[])
const technicalSheetStep = pgTable('TechnicalSheetStep', {
  id: id(),
  sheetId: text('sheetId').notNull().references(() => technicalSheet.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),             // ordem do passo
  text: text('text').notNull(),
  ...audit(),
}, (t) => ({
  sheetIdx: index('TechnicalSheetStep_sheetId_idx').on(t.sheetId),
}));

// módulo da ficha modular (FILHO de agregado — delete físico)
const sheetModule = pgTable('SheetModule', {
  id: id(),
  sheetId: text('sheetId').notNull().references(() => technicalSheet.id, { onDelete: 'cascade' }),
  legacyId: text('legacyId'),
  name: text('name').notNull(),
  required: boolean('required').default(true).notNull(),
  ...audit(),
}, (t) => ({
  sheetIdx: index('SheetModule_sheetId_idx').on(t.sheetId),
  legacyUq: uniqueIndex('SheetModule_sheet_legacy_uq').on(t.sheetId, t.legacyId).where(sql`"legacyId" is not null`),
}));

// opção do módulo (custo manual OU ficha vinculada — composição) (FILHO)
const sheetModuleOption = pgTable('SheetModuleOption', {
  id: id(),
  moduleId: text('moduleId').notNull().references(() => sheetModule.id, { onDelete: 'cascade' }),
  legacyId: text('legacyId'),
  name: text('name').notNull(),
  cost: numeric('cost', { precision: 18, scale: 2 }),
  isDefault: boolean('isDefault').default(false).notNull(),
  linkedSheetId: text('linkedSheetId').references(() => technicalSheet.id, { onDelete: 'set null' }),
  ...audit(),
}, (t) => ({
  moduleIdx: index('SheetModuleOption_moduleId_idx').on(t.moduleId),
  legacyUq: uniqueIndex('SheetModuleOption_module_legacy_uq').on(t.moduleId, t.legacyId).where(sql`"legacyId" is not null`),
}));

// ── Engenharia de cardápio ──────────────────────────────────────────────────
const menuItem = pgTable('MenuItem', {
  id: id(),
  clientId: text('clientId').notNull(),
  sheetId: text('sheetId').references(() => technicalSheet.id, { onDelete: 'set null' }),  // nullable: item de revenda sem ficha; CMV usa cost
  categoryId: text('categoryId').references(() => category.id, { onDelete: 'set null' }),
  legacyId: text('legacyId'),
  name: text('name').notNull(),
  category: text('category'),                          // label denormalizado
  salesEstimate: numeric('salesEstimate', { precision: 18, scale: 2 }),  // ← sales (média estimada)
  price: numeric('price', { precision: 18, scale: 2 }),
  cost: numeric('cost', { precision: 18, scale: 2 }),  // usado p/ CMV quando sheetId IS NULL
  active: boolean('active').default(true).notNull(),
  ...soft(),
  ...audit(),
}, (t) => ({
  clientIdx: index('MenuItem_clientId_idx').on(t.clientId),
  categoryIdx: index('MenuItem_categoryId_idx').on(t.categoryId),
  legacyUq: uniqueIndex('MenuItem_client_legacy_uq').on(t.clientId, t.legacyId).where(sql`"legacyId" is not null`),
}));

// ── Faturamento (FATO mutável — sem soft delete; correção via update/source) ─
const revenueEntry = pgTable('RevenueEntry', {     // mensal (revenue_history)
  id: id(),
  clientId: text('clientId').notNull(),
  year: integer('year').notNull(),
  month: integer('month').notNull(),               // 1-12
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  source: text('source').default('onboarding').notNull(),  // onboarding | integration
  ...audit(),
}, (t) => ({
  uniq: uniqueIndex('RevenueEntry_client_year_month_uq').on(t.clientId, t.year, t.month),
}));

const dailyRevenue = pgTable('DailyRevenue', {     // diário (daily_revenue)
  id: id(),
  clientId: text('clientId').notNull(),
  date: date('date').notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  source: text('source').default('manual').notNull(),
  ...audit(),
}, (t) => ({
  uniq: uniqueIndex('DailyRevenue_client_date_uq').on(t.clientId, t.date),
}));

// ── Company profile (1:1 with Client) ──────────────────────────────────────
const companyProfile = pgTable('CompanyProfile', {
  id: id(),
  clientId: text('clientId').notNull(),
  restaurantName: text('restaurantName'),
  restaurantCategory: text('restaurantCategory'),
  cuisineType: text('cuisineType'),             // ← identity.cuisine_type
  businessLogo: text('businessLogo'),           // ← identity.business_logo (só URL; base64 fica no blob)
  taxRegime: text('taxRegime'),                 // 'Simples Nacional' | 'Lucro Presumido' | ...
  isMei: boolean('isMei').default(false).notNull(),
  simplesRate: numeric('simplesRate', { precision: 5, scale: 2 }),
  rentMonthly: numeric('rentMonthly', { precision: 18, scale: 2 }),
  iptuAnnual: numeric('iptuAnnual', { precision: 18, scale: 2 }),
  // Perfil do dono (← data.user / data.profile / formData.user_info)
  ownerName: text('ownerName'),
  ownerRole: text('ownerRole'),                 // ← data.user.role (cargo do dono)
  ownerIsOwner: boolean('ownerIsOwner'),        // ← data.user.isOwner
  ownerEmail: text('ownerEmail'),
  ownerPhone: text('ownerPhone'),
  ownerCpf: text('ownerCpf'),                   // PII — mascarar em logs
  ownerBirthday: text('ownerBirthday'),
  ownerPhoto: text('ownerPhoto'),               // só URL; base64 fica no blob
  ...soft(),
  ...audit(),
}, (t) => ({
  clientUq: uniqueIndex('CompanyProfile_clientId_uq').on(t.clientId),
}));

// ── Fixed cost items (generic recurring costs) ──────────────────────────────
const fixedCostItem = pgTable('FixedCostItem', {
  id: id(),
  clientId: text('clientId').notNull(),
  legacyId: text('legacyId'),
  costGroup: text('costGroup').notNull(),   // = chave do formData: location_costs|utilities|recurring_services|operational_fixed|admin_systems|marketing_structure|monthly_services|other_fixed_costs
  costKey: text('costKey'),                 // chave do objeto (energy|software_pdv|...); null p/ arrays
  label: text('label'),                     // nome do item p/ arrays (monthly_services/other_fixed_costs)
  rawValue: text('rawValue'),               // valor ORIGINAL exato (string) — espelho fiel do blob
  amount: numeric('amount', { precision: 18, scale: 2 }),   // parse de rawValue (null se não-numérico, ex "meta")
  position: integer('position'),            // ordem dentro do array group
  active: boolean('active').default(true).notNull(),
  ...soft(),
  ...audit(),
}, (t) => ({
  clientGroupIdx: index('FixedCostItem_client_group_idx').on(t.clientId, t.costGroup),
}));

// ── Payroll employees (cost model do onboarding) ────────────────────────────
// bpoEmployeeId liga (best-effort, por nome) ao BpoEmployee operacional (Prisma).
const employee = pgTable('Employee', {
  id: id(),
  clientId: text('clientId').notNull(),
  legacyId: text('legacyId'),
  bpoEmployeeId: text('bpoEmployeeId'),     // FK→BpoEmployee SET NULL (SQL bruto)
  name: text('name'),
  cpf: text('cpf'),                         // raramente presente no blob; habilita match cpf-first
  role: text('role'),                       // ← role (cargo)
  regime: text('regime'),                   // CLT | PJ | Freela
  baseSalary: numeric('baseSalary', { precision: 18, scale: 2 }),
  bonus: numeric('bonus', { precision: 18, scale: 2 }),         // "premio"
  transportValue: numeric('transportValue', { precision: 18, scale: 2 }),
  transportQty: integer('transportQty'),
  workDays: integer('workDays'),
  foodCost: numeric('foodCost', { precision: 18, scale: 2 }),
  active: boolean('active').default(true).notNull(),
  ...soft(),
  ...audit(),
}, (t) => ({
  clientIdx: index('Employee_clientId_idx').on(t.clientId),
  legacyUq: uniqueIndex('Employee_client_legacy_uq').on(t.clientId, t.legacyId).where(sql`"legacyId" is not null`),
}));

// ── Partners (pró-labore) ───────────────────────────────────────────────────
const partner = pgTable('Partner', {
  id: id(),
  clientId: text('clientId').notNull(),
  legacyId: text('legacyId'),
  bpoPartnerId: text('bpoPartnerId'),       // FK→BpoPartner SET NULL (SQL bruto)
  name: text('name'),
  cpf: text('cpf'),
  role: text('role'),                       // ← role
  photoUrl: text('photoUrl'),               // foto do sócio no object storage (MinIO); base64 fica no blob até backfill
  proLabore: numeric('proLabore', { precision: 18, scale: 2 }),
  personalAccountBank: text('personalAccountBank'),
  personalAccountAgency: text('personalAccountAgency'),
  personalAccountNumber: text('personalAccountNumber'),
  active: boolean('active').default(true).notNull(),
  ...soft(),
  ...audit(),
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
  ...soft(),
  ...audit(),
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
  ...soft(),
  ...audit(),
}, (t) => ({
  clientIdx: index('Vehicle_clientId_idx').on(t.clientId),
}));

// ── Card machines (fees_cards) ──────────────────────────────────────────────
// Uma máquina gera DOIS PaymentMethod (débito e crédito) no BPO → duas FKs.
const cardMachine = pgTable('CardMachine', {
  id: id(),
  clientId: text('clientId').notNull(),
  legacyId: text('legacyId'),
  provider: text('provider'),
  customProvider: text('customProvider'),                // ← custom_provider (quando provider='Outra')
  debitRate: numeric('debitRate', { precision: 5, scale: 2 }),
  creditRate: numeric('creditRate', { precision: 5, scale: 2 }),
  debitPaymentMethodId: text('debitPaymentMethodId'),   // FK→PaymentMethod SET NULL (SQL bruto)
  creditPaymentMethodId: text('creditPaymentMethodId'), // FK→PaymentMethod SET NULL (SQL bruto)
  active: boolean('active').default(true).notNull(),
  ...soft(),
  ...audit(),
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
  paymentMethodId: text('paymentMethodId'),   // FK→PaymentMethod SET NULL (SQL bruto)
  active: boolean('active').default(true).notNull(),
  ...soft(),
  ...audit(),
}, (t) => ({
  clientIdx: index('Marketplace_clientId_idx').on(t.clientId),
}));

// ── Metric snapshots (FATO — metric_snapshots por YYYY-MM) ──────────────────
// drivers promovidos a colunas (queryáveis no admin); `drivers` jsonb mantido
// como raw exato (não-destrutivo). Chaves reais: marketplace/fixedCosts/cmv/
// cardFee/advances/loans.
const metricSnapshot = pgTable('MetricSnapshot', {
  id: id(),
  clientId: text('clientId').notNull(),
  periodKey: text('periodKey').notNull(),    // 'YYYY-MM'
  cmv: numeric('cmv', { precision: 18, scale: 4 }),
  marketplaceFee: numeric('marketplaceFee', { precision: 18, scale: 4 }),
  fixedCosts: numeric('fixedCosts', { precision: 18, scale: 4 }),
  cardFee: numeric('cardFee', { precision: 18, scale: 4 }),
  advances: numeric('advances', { precision: 18, scale: 4 }),
  loans: numeric('loans', { precision: 18, scale: 4 }),
  drivers: jsonb('drivers'),                 // raw exato (futuros drivers / auditoria)
  ...audit(),
}, (t) => ({
  uq: uniqueIndex('MetricSnapshot_client_period_uq').on(t.clientId, t.periodKey),
}));

module.exports = {
  // catálogo + fichas + menu + faturamento (0000)
  category,
  ingredient,
  ingredientComponent,
  technicalSheet,
  technicalSheetItem,
  technicalSheetStep,
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
