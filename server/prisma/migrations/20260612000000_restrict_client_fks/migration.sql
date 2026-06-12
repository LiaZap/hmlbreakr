-- Regra da base: FK ON DELETE RESTRICT (nunca CASCADE para dado crítico).
-- Troca as 16 FK clientId -> Client de CASCADE para RESTRICT. Seguro: o app
-- nunca apaga Client fisicamente (delete é soft: active=false, routes.js).
-- Protege o vínculo cross-ORM do Drizzle (Employee.bpoEmployeeId etc.) de sumir
-- silenciosamente por cascade. onUpdate CASCADE mantido (default do Prisma).

-- DropForeignKey / AddForeignKey (RESTRICT)
ALTER TABLE "BankAccount" DROP CONSTRAINT "BankAccount_clientId_fkey";
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BankTransfer" DROP CONSTRAINT "BankTransfer_clientId_fkey";
ALTER TABLE "BankTransfer" ADD CONSTRAINT "BankTransfer_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BpoEmployee" DROP CONSTRAINT "BpoEmployee_clientId_fkey";
ALTER TABLE "BpoEmployee" ADD CONSTRAINT "BpoEmployee_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BpoPartner" DROP CONSTRAINT "BpoPartner_clientId_fkey";
ALTER TABLE "BpoPartner" ADD CONSTRAINT "BpoPartner_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BpoTask" DROP CONSTRAINT "BpoTask_clientId_fkey";
ALTER TABLE "BpoTask" ADD CONSTRAINT "BpoTask_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClientDataSnapshot" DROP CONSTRAINT "ClientDataSnapshot_clientId_fkey";
ALTER TABLE "ClientDataSnapshot" ADD CONSTRAINT "ClientDataSnapshot_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialCategory" DROP CONSTRAINT "FinancialCategory_clientId_fkey";
ALTER TABLE "FinancialCategory" ADD CONSTRAINT "FinancialCategory_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Loan" DROP CONSTRAINT "Loan_clientId_fkey";
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payable" DROP CONSTRAINT "Payable_clientId_fkey";
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentMethod" DROP CONSTRAINT "PaymentMethod_clientId_fkey";
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PdvIntegration" DROP CONSTRAINT "PdvIntegration_clientId_fkey";
ALTER TABLE "PdvIntegration" ADD CONSTRAINT "PdvIntegration_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Receivable" DROP CONSTRAINT "Receivable_clientId_fkey";
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReceivableAdvance" DROP CONSTRAINT "ReceivableAdvance_clientId_fkey";
ALTER TABLE "ReceivableAdvance" ADD CONSTRAINT "ReceivableAdvance_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReconciliationRule" DROP CONSTRAINT "ReconciliationRule_clientId_fkey";
ALTER TABLE "ReconciliationRule" ADD CONSTRAINT "ReconciliationRule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Supplier" DROP CONSTRAINT "Supplier_clientId_fkey";
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TeamMember" DROP CONSTRAINT "TeamMember_clientId_fkey";
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
