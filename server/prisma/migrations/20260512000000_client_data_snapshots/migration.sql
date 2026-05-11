-- ClientDataSnapshot: snapshot histórico do Client.data (JSON blob ~330KB)
-- Pós-incidente Garapas (2026-05-11) onde metade do data foi sobrescrito
-- acidentalmente. Cada save no /client/:hash/sync gera um snapshot antes,
-- e pruneOldSnapshots mantém só os N mais recentes (default 20).

CREATE TABLE "ClientDataSnapshot" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientDataSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientDataSnapshot_clientId_createdAt_idx" ON "ClientDataSnapshot"("clientId", "createdAt");

ALTER TABLE "ClientDataSnapshot" ADD CONSTRAINT "ClientDataSnapshot_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
