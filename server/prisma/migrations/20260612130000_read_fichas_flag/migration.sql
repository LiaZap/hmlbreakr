-- F3: flag por cliente p/ ler operational.fichas das tabelas Drizzle
-- (TechnicalSheet + items/modules/options/steps). Default OFF, kill-switch.
ALTER TABLE "Client" ADD COLUMN "readFichasFromTables" BOOLEAN NOT NULL DEFAULT false;
