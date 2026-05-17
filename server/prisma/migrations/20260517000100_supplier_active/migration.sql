-- BAH-compliance: Supplier ganha campo `active` pra soft delete.
-- O CLAUDE.md já listava Supplier com soft delete por `active`, mas o
-- model não tinha o campo — o que quebrava o GET /suppliers e o DELETE
-- depois da correção anti-delete-físico. Coluna com DEFAULT true pra
-- aplicar sem falha em tabela com dados existentes.
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
