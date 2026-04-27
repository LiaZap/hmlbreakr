-- BPO Financeiro V2.0 — Fase 5 (stub)
-- WhatsappMessage e PdvIntegration prontos pra plugar Z-API e PDVs

CREATE TABLE "WhatsappMessage" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "fromNumber" TEXT NOT NULL,
    "senderName" TEXT,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "textContent" TEXT,
    "mediaUrl" TEXT,
    "mediaCaption" TEXT,
    "conversationStep" TEXT,
    "conversationData" TEXT,
    "validatedAt" TIMESTAMP(3),
    "validatedBy" TEXT,
    "createdPayableId" TEXT,
    "createdReceivableId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rawJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WhatsappMessage_clientId_status_idx" ON "WhatsappMessage"("clientId", "status");
CREATE INDEX "WhatsappMessage_fromNumber_idx" ON "WhatsappMessage"("fromNumber");
CREATE INDEX "WhatsappMessage_status_createdAt_idx" ON "WhatsappMessage"("status", "createdAt");

CREATE TABLE "PdvIntegration" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "authConfig" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdvIntegration_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PdvIntegration_clientId_active_idx" ON "PdvIntegration"("clientId", "active");

ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PdvIntegration" ADD CONSTRAINT "PdvIntegration_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
