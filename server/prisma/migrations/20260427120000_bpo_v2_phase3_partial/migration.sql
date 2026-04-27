-- BPO Financeiro V2.0 — Fase 3 (parcial) + Fase 4 Painel BPO
-- Conciliação manual + Transferências entre contas + Tarefas BPO

-- BankTransaction
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "externalId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'debit',
    "reconciledType" TEXT,
    "reconciledId" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'manual',
    "rawJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BankTransaction_bankAccountId_date_idx" ON "BankTransaction"("bankAccountId", "date");
CREATE INDEX "BankTransaction_reconciledType_reconciledId_idx" ON "BankTransaction"("reconciledType", "reconciledId");

-- ReconciliationRule
CREATE TABLE "ReconciliationRule" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'contains',
    "supplierId" TEXT,
    "payerName" TEXT,
    "categoryId" TEXT,
    "bankAccountId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReconciliationRule_clientId_active_idx" ON "ReconciliationRule"("clientId", "active");

-- BankTransfer
CREATE TABLE "BankTransfer" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "fee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransfer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BankTransfer_clientId_date_idx" ON "BankTransfer"("clientId", "date");

-- BpoTask
CREATE TABLE "BpoTask" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'normal',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedAt" TIMESTAMP(3),
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BpoTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BpoTask_clientId_status_idx" ON "BpoTask"("clientId", "status");
CREATE INDEX "BpoTask_status_severity_dueAt_idx" ON "BpoTask"("status", "severity", "dueAt");

-- FKs
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReconciliationRule" ADD CONSTRAINT "ReconciliationRule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BankTransfer" ADD CONSTRAINT "BankTransfer_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankTransfer" ADD CONSTRAINT "BankTransfer_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankTransfer" ADD CONSTRAINT "BankTransfer_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BpoTask" ADD CONSTRAINT "BpoTask_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
