-- Make CPF optional on BpoPartner and BpoEmployee
-- Onboarding doesn't ask for CPF, so we sync partners/employees by name
-- and let user add CPF later in BPO.

ALTER TABLE "BpoPartner" ALTER COLUMN "cpf" DROP NOT NULL;
ALTER TABLE "BpoEmployee" ALTER COLUMN "cpf" DROP NOT NULL;
