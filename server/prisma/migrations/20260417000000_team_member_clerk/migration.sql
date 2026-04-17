-- Add clerkUserId to TeamMember (nullable, unique)
ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "clerkUserId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "TeamMember_clerkUserId_key" ON "TeamMember"("clerkUserId");

-- Make password nullable (Clerk-authenticated members don't need local password)
ALTER TABLE "TeamMember" ALTER COLUMN "password" DROP NOT NULL;
