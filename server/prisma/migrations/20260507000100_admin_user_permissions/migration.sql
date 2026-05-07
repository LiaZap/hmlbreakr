-- Granular permissions per AdminUser. Empty array = use ROLE_TEMPLATES default.
ALTER TABLE "AdminUser" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
