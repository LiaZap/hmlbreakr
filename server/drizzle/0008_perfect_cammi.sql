ALTER TABLE "FixedCostItem" ALTER COLUMN "amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "FixedCostItem" ADD COLUMN "rawValue" text;--> statement-breakpoint
ALTER TABLE "FixedCostItem" ADD COLUMN "position" integer;