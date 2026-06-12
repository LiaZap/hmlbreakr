ALTER TABLE "TechnicalSheetItem" ALTER COLUMN "lineCost" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "TechnicalSheet" ADD COLUMN "prepTime" text;