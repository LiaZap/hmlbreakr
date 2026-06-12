-- F3 (strangler): flag por cliente p/ ler operational.insumos das tabelas
-- Drizzle (Ingredient+IngredientComponent) em vez do blob. Default OFF —
-- kill-switch reversível. Blob continua a fonte do WRITE.
ALTER TABLE "Client" ADD COLUMN "readInsumosFromTables" BOOLEAN NOT NULL DEFAULT false;
