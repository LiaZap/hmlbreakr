-- Schema compliance: updatedAt + soft-delete flag + missing indexes.
-- Regra do projeto (CLAUDE.md): todo model mutável precisa de createdAt + updatedAt
-- e @@index nos campos de busca/FK.
-- Aplicável em produção COM dados: novas colunas NOT NULL recebem DEFAULT.

-- TeamMember: soft delete + updatedAt
ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Broadcast: updatedAt
ALTER TABLE "Broadcast" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Recurrence: updatedAt
ALTER TABLE "Recurrence" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Indexes
CREATE INDEX IF NOT EXISTS "Agency_active_idx" ON "Agency"("active");
CREATE INDEX IF NOT EXISTS "Client_agencyId_idx" ON "Client"("agencyId");
CREATE INDEX IF NOT EXISTS "Client_active_idx" ON "Client"("active");
CREATE INDEX IF NOT EXISTS "TeamMember_clientId_idx" ON "TeamMember"("clientId");
CREATE INDEX IF NOT EXISTS "Broadcast_active_idx" ON "Broadcast"("active");
CREATE INDEX IF NOT EXISTS "Broadcast_targetCategory_idx" ON "Broadcast"("targetCategory");
CREATE INDEX IF NOT EXISTS "Recurrence_startDate_idx" ON "Recurrence"("startDate");
