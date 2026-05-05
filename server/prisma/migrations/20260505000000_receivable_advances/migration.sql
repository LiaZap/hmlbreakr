-- BAH-030: Antecipação de Recebíveis
-- Cliente cadastra antecipações de operadoras pra refletir no Dinheiro na Mesa.

CREATE TABLE "ReceivableAdvance" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "paymentMethodId" TEXT,
    "description" TEXT NOT NULL,
    "monthlyRate" DECIMAL(7,4) NOT NULL,
    "averageValue" DECIMAL(18,2) NOT NULL,
    "daysAdvanced" INTEGER NOT NULL,
    "dailyRate" DECIMAL(9,6) NOT NULL,
    "totalDiscount" DECIMAL(18,2) NOT NULL,
    "finalValue" DECIMAL(18,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceivableAdvance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReceivableAdvance_clientId_idx" ON "ReceivableAdvance"("clientId");

ALTER TABLE "ReceivableAdvance" ADD CONSTRAINT "ReceivableAdvance_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReceivableAdvance" ADD CONSTRAINT "ReceivableAdvance_paymentMethodId_fkey"
    FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
