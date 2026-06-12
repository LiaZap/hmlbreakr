CREATE TABLE "IngredientComponent" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"ingredientId" text NOT NULL,
	"parentComponentId" text,
	"componentIngredientId" text,
	"legacyId" text,
	"name" text NOT NULL,
	"category" text,
	"qty" numeric(18, 4),
	"unit" text,
	"unitCost" numeric(18, 6),
	"lineCost" numeric(18, 2),
	"isPrepared" boolean DEFAULT false NOT NULL,
	"position" integer,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"modifiedBy" text
);
--> statement-breakpoint
ALTER TABLE "Ingredient" ADD COLUMN "preparedYield" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "Ingredient" ADD COLUMN "preparedYieldUnit" text;--> statement-breakpoint
ALTER TABLE "Ingredient" ADD COLUMN "preparedTotalCost" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "CompanyProfile" ADD COLUMN "ownerRole" text;--> statement-breakpoint
ALTER TABLE "CompanyProfile" ADD COLUMN "ownerIsOwner" boolean;--> statement-breakpoint
ALTER TABLE "CardMachine" ADD COLUMN "customProvider" text;--> statement-breakpoint
ALTER TABLE "IngredientComponent" ADD CONSTRAINT "IngredientComponent_ingredientId_Ingredient_id_fk" FOREIGN KEY ("ingredientId") REFERENCES "public"."Ingredient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "IngredientComponent" ADD CONSTRAINT "IngredientComponent_componentIngredientId_Ingredient_id_fk" FOREIGN KEY ("componentIngredientId") REFERENCES "public"."Ingredient"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IngredientComponent_ingredientId_idx" ON "IngredientComponent" USING btree ("ingredientId");--> statement-breakpoint
CREATE INDEX "IngredientComponent_parentComponentId_idx" ON "IngredientComponent" USING btree ("parentComponentId");--> statement-breakpoint
-- F0.5 (0003) — self-FK da árvore de componentes (subIngredients aninhados).
-- Intra-Drizzle, mas self-ref é adicionada via SQL bruto (idempotente) p/ evitar
-- TDZ no schema.js. Cascade: apagar um componente apaga seus filhos.
ALTER TABLE "IngredientComponent" DROP CONSTRAINT IF EXISTS "IngredientComponent_parentComponentId_IngredientComponent_id_fk";--> statement-breakpoint
ALTER TABLE "IngredientComponent" ADD CONSTRAINT "IngredientComponent_parentComponentId_IngredientComponent_id_fk" FOREIGN KEY ("parentComponentId") REFERENCES "public"."IngredientComponent"("id") ON DELETE cascade ON UPDATE no action;