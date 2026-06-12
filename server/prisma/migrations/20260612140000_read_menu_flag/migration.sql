-- F3: flag por cliente p/ ler menuEngineering das tabelas (MenuItem). Default OFF.
ALTER TABLE "Client" ADD COLUMN "readMenuFromTables" BOOLEAN NOT NULL DEFAULT false;
