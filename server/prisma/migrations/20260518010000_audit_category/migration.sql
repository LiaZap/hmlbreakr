-- AuditLog.category: classifica cada evento da trilha de auditoria
-- ('security' | 'data' | 'bpo' | 'admin' | 'system'). Permite destacar
-- e filtrar eventos sensíveis de segurança. Nullable — eventos legados
-- (anteriores a esta migration) ficam sem categoria e a UI deriva pela
-- action.

ALTER TABLE "AuditLog" ADD COLUMN "category" TEXT;

CREATE INDEX "AuditLog_category_createdAt_idx" ON "AuditLog"("category", "createdAt");
