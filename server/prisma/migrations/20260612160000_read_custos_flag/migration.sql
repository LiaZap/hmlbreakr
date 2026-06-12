-- F3: flag por cliente p/ ler as 6 LISTAS de custos/onboarding (employees,
-- partners, equipment, vehicles, fees_cards, fees_marketplaces) das tabelas.
-- Objetos de custo + identity + onboarding seguem no blob. Default OFF.
ALTER TABLE "Client" ADD COLUMN "readCustosFromTables" BOOLEAN NOT NULL DEFAULT false;
