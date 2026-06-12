ALTER TABLE "TechnicalSheet" ADD COLUMN "yieldUnit" text;--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "legacyId" text;--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "purchaseQty" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "purchaseTotal" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "yield" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "yieldUnit" text;--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "isPrepared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "preparedYield" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "preparedYieldUnit" text;--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "preparedTotalCost" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "TechnicalSheetItem" ADD COLUMN "sourceUpdatedAt" timestamp (3);