CREATE TABLE "Category" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"clientId" text NOT NULL,
	"name" text NOT NULL,
	"scope" text NOT NULL,
	"color" text,
	"isSystem" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"isDeleted" boolean DEFAULT false NOT NULL,
	"deletedAt" timestamp (3),
	"deletedBy" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"modifiedBy" text
);
--> statement-breakpoint
CREATE TABLE "TechnicalSheetStep" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"sheetId" text NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"modifiedBy" text
);
--> statement-breakpoint
DROP INDEX "Ingredient_legacyId_idx";--> statement-breakpoint
DROP INDEX "TechnicalSheet_legacyId_idx";--> statement-breakpoint
ALTER TABLE "Ingredient" ADD COLUMN "categoryId" text;--> statement-breakpoint
ALTER TABLE "Ingredient" ADD COLUMN "packUnit" text;--> statement-breakpoint
ALTER TABLE "Ingredient" ADD COLUMN "price" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "Ingredient" ADD COLUMN "refQty" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "Ingredient" ADD COLUMN "defaultQty" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "Ingredient" ADD COLUMN "grossQty" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "Ingredient" ADD COLUMN "yield" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "Ingredient" ADD COLUMN "yieldUnit" text;--> statement-breakpoint
ALTER TABLE "Ingredient" ADD COLUMN "isPrepared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Ingredient" ADD COLUMN "sourceUpdatedAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "Ingredient" ADD COLUMN "deletedBy" text;--> statement-breakpoint
ALTER TABLE "Ingredient" ADD COLUMN "modifiedBy" text;--> statement-breakpoint
ALTER TABLE "TechnicalSheet" ADD COLUMN "categoryId" text;--> statement-breakpoint
ALTER TABLE "TechnicalSheet" ADD COLUMN "costIngredients" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "TechnicalSheet" ADD COLUMN "costPackaging" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "TechnicalSheet" ADD COLUMN "salesEstimateMonthly" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "TechnicalSheet" ADD COLUMN "prepTimeMinutes" integer;--> statement-breakpoint
ALTER TABLE "TechnicalSheet" ADD COLUMN "utensils" text;--> statement-breakpoint
ALTER TABLE "TechnicalSheet" ADD COLUMN "finishing" text;--> statement-breakpoint
ALTER TABLE "TechnicalSheet" ADD COLUMN "dishPhoto" text;--> statement-breakpoint
ALTER TABLE "TechnicalSheet" ADD COLUMN "isImported" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "TechnicalSheet" ADD COLUMN "progress" integer;--> statement-breakpoint
ALTER TABLE "TechnicalSheet" ADD COLUMN "sourceCreatedAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "TechnicalSheet" ADD COLUMN "sourceUpdatedAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "TechnicalSheet" ADD COLUMN "deletedBy" text;--> statement-breakpoint
ALTER TABLE "TechnicalSheet" ADD COLUMN "modifiedBy" text;--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "defaultQty" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "grossQty" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "netQty" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "correctionFactor" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "usageUnit" text;--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "purchaseUnit" text;--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "originalUnit" text;--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "createdAt" timestamp (3) DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "updatedAt" timestamp (3) DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "modifiedBy" text;--> statement-breakpoint
ALTER TABLE "SheetModule" ADD COLUMN "createdAt" timestamp (3) DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "SheetModule" ADD COLUMN "updatedAt" timestamp (3) DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "SheetModule" ADD COLUMN "modifiedBy" text;--> statement-breakpoint
ALTER TABLE "SheetModuleOption" ADD COLUMN "createdAt" timestamp (3) DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "SheetModuleOption" ADD COLUMN "updatedAt" timestamp (3) DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "SheetModuleOption" ADD COLUMN "modifiedBy" text;--> statement-breakpoint
ALTER TABLE "MenuItem" ADD COLUMN "categoryId" text;--> statement-breakpoint
ALTER TABLE "MenuItem" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "MenuItem" ADD COLUMN "deletedBy" text;--> statement-breakpoint
ALTER TABLE "MenuItem" ADD COLUMN "modifiedBy" text;--> statement-breakpoint
ALTER TABLE "RevenueEntry" ADD COLUMN "modifiedBy" text;--> statement-breakpoint
ALTER TABLE "DailyRevenue" ADD COLUMN "updatedAt" timestamp (3) DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "DailyRevenue" ADD COLUMN "modifiedBy" text;--> statement-breakpoint
ALTER TABLE "CompanyProfile" ADD COLUMN "cuisineType" text;--> statement-breakpoint
ALTER TABLE "CompanyProfile" ADD COLUMN "businessLogo" text;--> statement-breakpoint
ALTER TABLE "CompanyProfile" ADD COLUMN "ownerName" text;--> statement-breakpoint
ALTER TABLE "CompanyProfile" ADD COLUMN "ownerEmail" text;--> statement-breakpoint
ALTER TABLE "CompanyProfile" ADD COLUMN "ownerPhone" text;--> statement-breakpoint
ALTER TABLE "CompanyProfile" ADD COLUMN "ownerCpf" text;--> statement-breakpoint
ALTER TABLE "CompanyProfile" ADD COLUMN "ownerBirthday" text;--> statement-breakpoint
ALTER TABLE "CompanyProfile" ADD COLUMN "ownerPhoto" text;--> statement-breakpoint
ALTER TABLE "CompanyProfile" ADD COLUMN "isDeleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "CompanyProfile" ADD COLUMN "deletedAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "CompanyProfile" ADD COLUMN "deletedBy" text;--> statement-breakpoint
ALTER TABLE "CompanyProfile" ADD COLUMN "modifiedBy" text;--> statement-breakpoint
ALTER TABLE "FixedCostItem" ADD COLUMN "isDeleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "FixedCostItem" ADD COLUMN "deletedAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "FixedCostItem" ADD COLUMN "deletedBy" text;--> statement-breakpoint
ALTER TABLE "FixedCostItem" ADD COLUMN "modifiedBy" text;--> statement-breakpoint
ALTER TABLE "Employee" ADD COLUMN "bpoEmployeeId" text;--> statement-breakpoint
ALTER TABLE "Employee" ADD COLUMN "cpf" text;--> statement-breakpoint
ALTER TABLE "Employee" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "Employee" ADD COLUMN "deletedBy" text;--> statement-breakpoint
ALTER TABLE "Employee" ADD COLUMN "modifiedBy" text;--> statement-breakpoint
ALTER TABLE "Partner" ADD COLUMN "bpoPartnerId" text;--> statement-breakpoint
ALTER TABLE "Partner" ADD COLUMN "cpf" text;--> statement-breakpoint
ALTER TABLE "Partner" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "Partner" ADD COLUMN "isDeleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Partner" ADD COLUMN "deletedAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "Partner" ADD COLUMN "deletedBy" text;--> statement-breakpoint
ALTER TABLE "Partner" ADD COLUMN "modifiedBy" text;--> statement-breakpoint
ALTER TABLE "Equipment" ADD COLUMN "isDeleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Equipment" ADD COLUMN "deletedAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "Equipment" ADD COLUMN "deletedBy" text;--> statement-breakpoint
ALTER TABLE "Equipment" ADD COLUMN "modifiedBy" text;--> statement-breakpoint
ALTER TABLE "Vehicle" ADD COLUMN "isDeleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Vehicle" ADD COLUMN "deletedAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "Vehicle" ADD COLUMN "deletedBy" text;--> statement-breakpoint
ALTER TABLE "Vehicle" ADD COLUMN "modifiedBy" text;--> statement-breakpoint
ALTER TABLE "CardMachine" ADD COLUMN "debitPaymentMethodId" text;--> statement-breakpoint
ALTER TABLE "CardMachine" ADD COLUMN "creditPaymentMethodId" text;--> statement-breakpoint
ALTER TABLE "CardMachine" ADD COLUMN "isDeleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "CardMachine" ADD COLUMN "deletedAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "CardMachine" ADD COLUMN "deletedBy" text;--> statement-breakpoint
ALTER TABLE "CardMachine" ADD COLUMN "modifiedBy" text;--> statement-breakpoint
ALTER TABLE "Marketplace" ADD COLUMN "paymentMethodId" text;--> statement-breakpoint
ALTER TABLE "Marketplace" ADD COLUMN "isDeleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Marketplace" ADD COLUMN "deletedAt" timestamp (3);--> statement-breakpoint
ALTER TABLE "Marketplace" ADD COLUMN "deletedBy" text;--> statement-breakpoint
ALTER TABLE "Marketplace" ADD COLUMN "modifiedBy" text;--> statement-breakpoint
ALTER TABLE "MetricSnapshot" ADD COLUMN "cmv" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "MetricSnapshot" ADD COLUMN "marketplaceFee" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "MetricSnapshot" ADD COLUMN "fixedCosts" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "MetricSnapshot" ADD COLUMN "cardFee" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "MetricSnapshot" ADD COLUMN "advances" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "MetricSnapshot" ADD COLUMN "loans" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "MetricSnapshot" ADD COLUMN "modifiedBy" text;--> statement-breakpoint
ALTER TABLE "TechnicalSheetStep" ADD CONSTRAINT "TechnicalSheetStep_sheetId_TechnicalSheet_id_fk" FOREIGN KEY ("sheetId") REFERENCES "public"."TechnicalSheet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "Category_clientId_idx" ON "Category" USING btree ("clientId");--> statement-breakpoint
CREATE UNIQUE INDEX "Category_client_scope_name_uq" ON "Category" USING btree ("clientId","scope","name") WHERE "isDeleted" = false;--> statement-breakpoint
CREATE INDEX "TechnicalSheetStep_sheetId_idx" ON "TechnicalSheetStep" USING btree ("sheetId");--> statement-breakpoint
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_categoryId_Category_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "TechnicalSheet" ADD CONSTRAINT "TechnicalSheet_categoryId_Category_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_Category_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "Ingredient_categoryId_idx" ON "Ingredient" USING btree ("categoryId");--> statement-breakpoint
CREATE UNIQUE INDEX "Ingredient_client_legacy_uq" ON "Ingredient" USING btree ("clientId","legacyId") WHERE "legacyId" is not null;--> statement-breakpoint
CREATE INDEX "TechnicalSheet_categoryId_idx" ON "TechnicalSheet" USING btree ("categoryId");--> statement-breakpoint
CREATE UNIQUE INDEX "TechnicalSheet_client_legacy_uq" ON "TechnicalSheet" USING btree ("clientId","legacyId") WHERE "legacyId" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "SheetModule_sheet_legacy_uq" ON "SheetModule" USING btree ("sheetId","legacyId") WHERE "legacyId" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "SheetModuleOption_module_legacy_uq" ON "SheetModuleOption" USING btree ("moduleId","legacyId") WHERE "legacyId" is not null;--> statement-breakpoint
CREATE INDEX "MenuItem_categoryId_idx" ON "MenuItem" USING btree ("categoryId");--> statement-breakpoint
CREATE UNIQUE INDEX "MenuItem_client_legacy_uq" ON "MenuItem" USING btree ("clientId","legacyId") WHERE "legacyId" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "Employee_client_legacy_uq" ON "Employee" USING btree ("clientId","legacyId") WHERE "legacyId" is not null;--> statement-breakpoint
-- ===========================================================================
-- F0.5 — SQL bruto APPENDADO (FKs cross-ORM, invisiveis ao snapshot do Drizzle).
-- Idempotente: DROP CONSTRAINT IF EXISTS antes de cada ADD. NUNCA declarar estas
-- no schema.js com .references() (Client/BpoEmployee/BpoPartner/PaymentMethod sao
-- do Prisma) — senao o generate duplica. Ver docs/plano-migracao-castelo-de-areia.md.
-- Pre-check de orfaos executado (0) antes de aplicar; FK cross-ORM nascem com
-- coluna NULL (sem violacao). Para regenerar 0002: apague .sql + snapshot + entry
-- do journal e refaca o append (nunca re-gerar por cima).
-- ===========================================================================
-- (1) clientId -> Client: CASCADE -> RESTRICT (regra da base: nunca CASCADE p/ dado critico)
ALTER TABLE "Ingredient" DROP CONSTRAINT IF EXISTS "Ingredient_clientId_Client_id_fk";--> statement-breakpoint
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "TechnicalSheet" DROP CONSTRAINT IF EXISTS "TechnicalSheet_clientId_Client_id_fk";--> statement-breakpoint
ALTER TABLE "TechnicalSheet" ADD CONSTRAINT "TechnicalSheet_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "MenuItem" DROP CONSTRAINT IF EXISTS "MenuItem_clientId_Client_id_fk";--> statement-breakpoint
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "RevenueEntry" DROP CONSTRAINT IF EXISTS "RevenueEntry_clientId_Client_id_fk";--> statement-breakpoint
ALTER TABLE "RevenueEntry" ADD CONSTRAINT "RevenueEntry_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "DailyRevenue" DROP CONSTRAINT IF EXISTS "DailyRevenue_clientId_Client_id_fk";--> statement-breakpoint
ALTER TABLE "DailyRevenue" ADD CONSTRAINT "DailyRevenue_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CompanyProfile" DROP CONSTRAINT IF EXISTS "CompanyProfile_clientId_Client_id_fk";--> statement-breakpoint
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "FixedCostItem" DROP CONSTRAINT IF EXISTS "FixedCostItem_clientId_Client_id_fk";--> statement-breakpoint
ALTER TABLE "FixedCostItem" ADD CONSTRAINT "FixedCostItem_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Employee" DROP CONSTRAINT IF EXISTS "Employee_clientId_Client_id_fk";--> statement-breakpoint
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Partner" DROP CONSTRAINT IF EXISTS "Partner_clientId_Client_id_fk";--> statement-breakpoint
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Equipment" DROP CONSTRAINT IF EXISTS "Equipment_clientId_Client_id_fk";--> statement-breakpoint
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Vehicle" DROP CONSTRAINT IF EXISTS "Vehicle_clientId_Client_id_fk";--> statement-breakpoint
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CardMachine" DROP CONSTRAINT IF EXISTS "CardMachine_clientId_Client_id_fk";--> statement-breakpoint
ALTER TABLE "CardMachine" ADD CONSTRAINT "CardMachine_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Marketplace" DROP CONSTRAINT IF EXISTS "Marketplace_clientId_Client_id_fk";--> statement-breakpoint
ALTER TABLE "Marketplace" ADD CONSTRAINT "Marketplace_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "MetricSnapshot" DROP CONSTRAINT IF EXISTS "MetricSnapshot_clientId_Client_id_fk";--> statement-breakpoint
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- (2) Category -> Client (nova, RESTRICT)
ALTER TABLE "Category" DROP CONSTRAINT IF EXISTS "Category_clientId_Client_id_fk";--> statement-breakpoint
ALTER TABLE "Category" ADD CONSTRAINT "Category_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- (3) Vinculos cross-ORM (SET NULL — nao-criticos, nullable; alvos sao tabelas do Prisma)
ALTER TABLE "Employee" DROP CONSTRAINT IF EXISTS "Employee_bpoEmployeeId_BpoEmployee_id_fk";--> statement-breakpoint
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_bpoEmployeeId_BpoEmployee_id_fk" FOREIGN KEY ("bpoEmployeeId") REFERENCES "public"."BpoEmployee"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Partner" DROP CONSTRAINT IF EXISTS "Partner_bpoPartnerId_BpoPartner_id_fk";--> statement-breakpoint
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_bpoPartnerId_BpoPartner_id_fk" FOREIGN KEY ("bpoPartnerId") REFERENCES "public"."BpoPartner"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CardMachine" DROP CONSTRAINT IF EXISTS "CardMachine_debitPaymentMethodId_PaymentMethod_id_fk";--> statement-breakpoint
ALTER TABLE "CardMachine" ADD CONSTRAINT "CardMachine_debitPaymentMethodId_PaymentMethod_id_fk" FOREIGN KEY ("debitPaymentMethodId") REFERENCES "public"."PaymentMethod"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CardMachine" DROP CONSTRAINT IF EXISTS "CardMachine_creditPaymentMethodId_PaymentMethod_id_fk";--> statement-breakpoint
ALTER TABLE "CardMachine" ADD CONSTRAINT "CardMachine_creditPaymentMethodId_PaymentMethod_id_fk" FOREIGN KEY ("creditPaymentMethodId") REFERENCES "public"."PaymentMethod"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Marketplace" DROP CONSTRAINT IF EXISTS "Marketplace_paymentMethodId_PaymentMethod_id_fk";--> statement-breakpoint
ALTER TABLE "Marketplace" ADD CONSTRAINT "Marketplace_paymentMethodId_PaymentMethod_id_fk" FOREIGN KEY ("paymentMethodId") REFERENCES "public"."PaymentMethod"("id") ON DELETE set null ON UPDATE no action;