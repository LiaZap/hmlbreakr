-- BAH-031: Empréstimos e Financiamentos
-- Cliente registra contratos com bancos com parcela mensal calculada via Price.

CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "contractNumber" TEXT,
    "description" TEXT,
    "principal" DECIMAL(18,2) NOT NULL,
    "interestRateMonthly" DECIMAL(7,4) NOT NULL,
    "totalInstallments" INTEGER NOT NULL,
    "paidInstallments" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL,
    "installmentValue" DECIMAL(18,2) NOT NULL,
    "totalToPay" DECIMAL(18,2) NOT NULL,
    "totalInterest" DECIMAL(18,2) NOT NULL,
    "currentBalance" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Loan_clientId_idx" ON "Loan"("clientId");
CREATE INDEX "Loan_status_idx" ON "Loan"("status");

ALTER TABLE "Loan" ADD CONSTRAINT "Loan_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
