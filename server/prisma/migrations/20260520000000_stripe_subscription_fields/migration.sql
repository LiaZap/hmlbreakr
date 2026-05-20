-- Stripe — F1: ciclo de vida da assinatura no Client + tabela de eventos
-- pra idempotência do webhook. Mais detalhes: docs/roadmap-stripe.md (a criar).

-- Client: campos da assinatura e bloqueio manual ---------------------------
ALTER TABLE "Client" ADD COLUMN "subscriptionStatus" TEXT;
ALTER TABLE "Client" ADD COLUMN "subscriptionPlan"   TEXT;
ALTER TABLE "Client" ADD COLUMN "trialEndsAt"        TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN "currentPeriodEnd"   TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN "pastDueSince"       TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN "canceledAt"         TIMESTAMP(3);

ALTER TABLE "Client" ADD COLUMN "blockedByAdmin"     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN "blockedAt"          TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN "blockedReason"      TEXT;
ALTER TABLE "Client" ADD COLUMN "blockedByUserId"    TEXT;

CREATE INDEX "Client_subscriptionStatus_idx" ON "Client"("subscriptionStatus");
CREATE INDEX "Client_blockedByAdmin_idx"     ON "Client"("blockedByAdmin");

-- StripeEvent: idempotência do webhook -----------------------------------
CREATE TABLE "StripeEvent" (
    "id"          TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "clientId"    TEXT,
    "payload"     TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StripeEvent_type_processedAt_idx"     ON "StripeEvent"("type", "processedAt");
CREATE INDEX "StripeEvent_clientId_processedAt_idx" ON "StripeEvent"("clientId", "processedAt");
