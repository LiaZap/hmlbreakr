CREATE TABLE "Ingredient" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"clientId" text NOT NULL,
	"legacyId" text,
	"name" text NOT NULL,
	"category" text,
	"unit" text,
	"packPrice" numeric(18, 2),
	"packQty" numeric(18, 4),
	"unitCost" numeric(18, 6),
	"active" boolean DEFAULT true NOT NULL,
	"isDeleted" boolean DEFAULT false NOT NULL,
	"deletedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TechnicalSheet" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"clientId" text NOT NULL,
	"legacyId" text,
	"name" text NOT NULL,
	"category" text,
	"isModular" boolean DEFAULT false NOT NULL,
	"yield" numeric(18, 4),
	"sellingPrice" numeric(18, 2),
	"totalCost" numeric(18, 2),
	"costMin" numeric(18, 2),
	"costMax" numeric(18, 2),
	"active" boolean DEFAULT true NOT NULL,
	"isDeleted" boolean DEFAULT false NOT NULL,
	"deletedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TechnicalSheetItem" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"sheetId" text NOT NULL,
	"ingredientId" text,
	"description" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit" text,
	"unitCost" numeric(18, 6) NOT NULL,
	"lineCost" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SheetModule" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"sheetId" text NOT NULL,
	"legacyId" text,
	"name" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SheetModuleOption" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"moduleId" text NOT NULL,
	"legacyId" text,
	"name" text NOT NULL,
	"cost" numeric(18, 2),
	"isDefault" boolean DEFAULT false NOT NULL,
	"linkedSheetId" text
);
--> statement-breakpoint
CREATE TABLE "MenuItem" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"clientId" text NOT NULL,
	"sheetId" text,
	"legacyId" text,
	"name" text NOT NULL,
	"category" text,
	"salesEstimate" numeric(18, 2),
	"price" numeric(18, 2),
	"cost" numeric(18, 2),
	"isDeleted" boolean DEFAULT false NOT NULL,
	"deletedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "RevenueEntry" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"clientId" text NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"source" text DEFAULT 'onboarding' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "DailyRevenue" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"clientId" text NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD CONSTRAINT "TechnicalSheetItem_sheetId_TechnicalSheet_id_fk" FOREIGN KEY ("sheetId") REFERENCES "public"."TechnicalSheet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD CONSTRAINT "TechnicalSheetItem_ingredientId_Ingredient_id_fk" FOREIGN KEY ("ingredientId") REFERENCES "public"."Ingredient"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "SheetModule" ADD CONSTRAINT "SheetModule_sheetId_TechnicalSheet_id_fk" FOREIGN KEY ("sheetId") REFERENCES "public"."TechnicalSheet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "SheetModuleOption" ADD CONSTRAINT "SheetModuleOption_moduleId_SheetModule_id_fk" FOREIGN KEY ("moduleId") REFERENCES "public"."SheetModule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "SheetModuleOption" ADD CONSTRAINT "SheetModuleOption_linkedSheetId_TechnicalSheet_id_fk" FOREIGN KEY ("linkedSheetId") REFERENCES "public"."TechnicalSheet"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_sheetId_TechnicalSheet_id_fk" FOREIGN KEY ("sheetId") REFERENCES "public"."TechnicalSheet"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "Ingredient_clientId_idx" ON "Ingredient" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "Ingredient_legacyId_idx" ON "Ingredient" USING btree ("clientId","legacyId");--> statement-breakpoint
CREATE INDEX "TechnicalSheet_clientId_idx" ON "TechnicalSheet" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "TechnicalSheet_legacyId_idx" ON "TechnicalSheet" USING btree ("clientId","legacyId");--> statement-breakpoint
CREATE INDEX "TechnicalSheetItem_sheetId_idx" ON "TechnicalSheetItem" USING btree ("sheetId");--> statement-breakpoint
CREATE INDEX "SheetModule_sheetId_idx" ON "SheetModule" USING btree ("sheetId");--> statement-breakpoint
CREATE INDEX "SheetModuleOption_moduleId_idx" ON "SheetModuleOption" USING btree ("moduleId");--> statement-breakpoint
CREATE INDEX "MenuItem_clientId_idx" ON "MenuItem" USING btree ("clientId");--> statement-breakpoint
CREATE UNIQUE INDEX "RevenueEntry_client_year_month_uq" ON "RevenueEntry" USING btree ("clientId","year","month");--> statement-breakpoint
CREATE UNIQUE INDEX "DailyRevenue_client_date_uq" ON "DailyRevenue" USING btree ("clientId","date");--> statement-breakpoint
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "TechnicalSheet" ADD CONSTRAINT "TechnicalSheet_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "RevenueEntry" ADD CONSTRAINT "RevenueEntry_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "DailyRevenue" ADD CONSTRAINT "DailyRevenue_clientId_Client_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE cascade ON UPDATE no action;