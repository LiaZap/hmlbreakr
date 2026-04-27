-- BPO Financeiro V2.0 — Fase 1
-- Adiciona flag bpoEnabled em Client e cria 10 modelos novos (Supplier, BankAccount,
-- FinancialCategory, BpoEmployee, BpoPartner, PaymentMethod, Payable, Receivable,
-- Recurrence, PaymentTransaction).
-- Doc: [[Breakr V2.0 - Plano de Acao BPO Financeiro]]

-- AlterTable: Client
ALTER TABLE "Client" ADD COLUMN "bpoEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN "bpoActivatedAt" TIMESTAMP(3);

-- CreateTable: Recurrence (criada antes pois Payable/Receivable referenciam)
CREATE TABLE "Recurrence" (
    "id" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "occurrencesCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BankAccount
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'corrente',
    "currentBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "isManual" BOOLEAN NOT NULL DEFAULT true,
    "openFinanceItemId" TEXT,
    "openFinanceConnected" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BankAccount_clientId_idx" ON "BankAccount"("clientId");

-- CreateTable: FinancialCategory
CREATE TABLE "FinancialCategory" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parentId" TEXT,
    "dreGroup" TEXT,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialCategory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FinancialCategory_clientId_idx" ON "FinancialCategory"("clientId");

-- CreateTable: Supplier
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "pixKey" TEXT,
    "bankCode" TEXT,
    "agency" TEXT,
    "account" TEXT,
    "defaultCategoryId" TEXT,
    "defaultBankAccountId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Supplier_clientId_idx" ON "Supplier"("clientId");
CREATE UNIQUE INDEX "Supplier_clientId_cnpj_key" ON "Supplier"("clientId", "cnpj");

-- CreateTable: BpoEmployee
CREATE TABLE "BpoEmployee" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "bankCode" TEXT,
    "agency" TEXT,
    "account" TEXT,
    "pixKey" TEXT,
    "role" TEXT NOT NULL,
    "isFreelancer" BOOLEAN NOT NULL DEFAULT false,
    "isMotoboy" BOOLEAN NOT NULL DEFAULT false,
    "baseSalary" DECIMAL(18,2),
    "commissionPct" DECIMAL(5,2),
    "tipsAmount" DECIMAL(18,2),
    "overtimeAmount" DECIMAL(18,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "hiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BpoEmployee_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BpoEmployee_clientId_idx" ON "BpoEmployee"("clientId");
CREATE UNIQUE INDEX "BpoEmployee_clientId_cpf_key" ON "BpoEmployee"("clientId", "cpf");

-- CreateTable: BpoPartner
CREATE TABLE "BpoPartner" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "prolaboreAmount" DECIMAL(18,2) NOT NULL,
    "personalAccountBank" TEXT,
    "personalAccountAgency" TEXT,
    "personalAccountNumber" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BpoPartner_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BpoPartner_clientId_idx" ON "BpoPartner"("clientId");
CREATE UNIQUE INDEX "BpoPartner_clientId_cpf_key" ON "BpoPartner"("clientId", "cpf");

-- CreateTable: PaymentMethod
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "feePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "settlementDays" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentMethod_clientId_idx" ON "PaymentMethod"("clientId");

-- CreateTable: Payable
CREATE TABLE "Payable" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "supplierId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "remainingAmount" DECIMAL(18,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paymentForecast" TIMESTAMP(3) NOT NULL,
    "emissionDate" TIMESTAMP(3),
    "invoiceNumber" TEXT,
    "description" TEXT,
    "categoryId" TEXT,
    "department" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "recurrenceId" TEXT,
    "parentId" TEXT,
    "installmentNumber" INTEGER,
    "attachments" TEXT,
    "taxesRetained" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "scheduledBankId" TEXT,
    "scheduledStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Payable_clientId_status_dueDate_idx" ON "Payable"("clientId", "status", "dueDate");
CREATE INDEX "Payable_supplierId_idx" ON "Payable"("supplierId");

-- CreateTable: Receivable
CREATE TABLE "Receivable" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "payerName" TEXT NOT NULL,
    "payerDocument" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "remainingAmount" DECIMAL(18,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "receiptForecast" TIMESTAMP(3) NOT NULL,
    "emissionDate" TIMESTAMP(3),
    "invoiceNumber" TEXT,
    "description" TEXT,
    "categoryId" TEXT,
    "paymentMethodId" TEXT,
    "department" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "recurrenceId" TEXT,
    "parentId" TEXT,
    "installmentNumber" INTEGER,
    "pdvSaleId" TEXT,
    "attachments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Receivable_clientId_status_dueDate_idx" ON "Receivable"("clientId", "status", "dueDate");

-- CreateTable: PaymentTransaction
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "payableId" TEXT,
    "receivableId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "isPartial" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentTransaction_payableId_idx" ON "PaymentTransaction"("payableId");
CREATE INDEX "PaymentTransaction_receivableId_idx" ON "PaymentTransaction"("receivableId");
CREATE INDEX "PaymentTransaction_bankAccountId_paidAt_idx" ON "PaymentTransaction"("bankAccountId", "paidAt");

-- AddForeignKey: Supplier
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_defaultCategoryId_fkey" FOREIGN KEY ("defaultCategoryId") REFERENCES "FinancialCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_defaultBankAccountId_fkey" FOREIGN KEY ("defaultBankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: BankAccount
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: FinancialCategory
ALTER TABLE "FinancialCategory" ADD CONSTRAINT "FinancialCategory_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialCategory" ADD CONSTRAINT "FinancialCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FinancialCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: BpoEmployee
ALTER TABLE "BpoEmployee" ADD CONSTRAINT "BpoEmployee_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: BpoPartner
ALTER TABLE "BpoPartner" ADD CONSTRAINT "BpoPartner_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: PaymentMethod
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Payable
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "Recurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Payable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Receivable
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "Recurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Receivable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: PaymentTransaction
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "Payable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
