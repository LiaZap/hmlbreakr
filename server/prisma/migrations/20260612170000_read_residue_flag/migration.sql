-- F3 (resíduo): flag por cliente p/ ler identity/user/profile/restaurant/
-- metric_snapshots das tabelas (CompanyProfile+MetricSnapshot). Imagens base64
-- via fallback do blob; user_info segue no blob. Default OFF.
ALTER TABLE "Client" ADD COLUMN "readResidueFromTables" BOOLEAN NOT NULL DEFAULT false;
