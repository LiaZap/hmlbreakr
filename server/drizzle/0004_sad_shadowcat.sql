ALTER TABLE "IngredientComponent" ADD COLUMN "packUnit" text;--> statement-breakpoint
ALTER TABLE "IngredientComponent" ADD COLUMN "packPrice" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "IngredientComponent" ADD COLUMN "packQty" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "IngredientComponent" ADD COLUMN "defaultQty" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "IngredientComponent" ADD COLUMN "grossQty" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "IngredientComponent" ADD COLUMN "netQty" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "IngredientComponent" ADD COLUMN "correctionFactor" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "IngredientComponent" ADD COLUMN "usageUnit" text;--> statement-breakpoint
ALTER TABLE "IngredientComponent" ADD COLUMN "originalUnit" text;--> statement-breakpoint
ALTER TABLE "IngredientComponent" ADD COLUMN "yield" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "IngredientComponent" ADD COLUMN "yieldUnit" text;--> statement-breakpoint
ALTER TABLE "IngredientComponent" ADD COLUMN "preparedYield" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "IngredientComponent" ADD COLUMN "preparedYieldUnit" text;--> statement-breakpoint
ALTER TABLE "IngredientComponent" ADD COLUMN "preparedTotalCost" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "IngredientComponent" ADD COLUMN "sourceUpdatedAt" timestamp (3);