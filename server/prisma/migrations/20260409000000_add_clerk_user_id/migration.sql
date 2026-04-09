-- Add clerkUserId to Client table for Clerk auth integration
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "clerkUserId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Client_clerkUserId_key" ON "Client"("clerkUserId") WHERE "clerkUserId" IS NOT NULL;
