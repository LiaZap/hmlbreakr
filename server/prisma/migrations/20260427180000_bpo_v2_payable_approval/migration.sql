-- BPO V2.0 — Workflow de aprovação de pagamentos pelo dono
-- Quando BPO operador agenda pagamento marcando requiresApproval, dono precisa aprovar.

ALTER TABLE "Payable" ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Payable" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "Payable" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "Payable" ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "Payable" ADD COLUMN "rejectionReason" TEXT;

CREATE INDEX "Payable_clientId_requiresApproval_idx" ON "Payable"("clientId", "requiresApproval");
