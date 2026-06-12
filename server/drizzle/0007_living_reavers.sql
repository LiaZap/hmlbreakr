ALTER TABLE "IngredientComponent" ALTER COLUMN "ingredientId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "IngredientComponent" ADD COLUMN "technicalSheetItemId" text;--> statement-breakpoint
ALTER TABLE "IngredientComponent" ADD CONSTRAINT "IngredientComponent_technicalSheetItemId_TechnicalSheetItem_id_fk" FOREIGN KEY ("technicalSheetItemId") REFERENCES "public"."TechnicalSheetItem"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IngredientComponent_technicalSheetItemId_idx" ON "IngredientComponent" USING btree ("technicalSheetItemId");