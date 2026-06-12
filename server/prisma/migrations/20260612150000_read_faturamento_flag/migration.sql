-- F3: flag por cliente p/ ler faturamento (revenue_history + daily_revenue) das
-- tabelas (RevenueEntry + DailyRevenue). Default OFF.
ALTER TABLE "Client" ADD COLUMN "readFaturamentoFromTables" BOOLEAN NOT NULL DEFAULT false;
