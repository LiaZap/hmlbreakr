-- AlterTable Client: add auth reset, stripe, and agency fields
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "resetToken" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "resetTokenAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "agencyId" INTEGER;

-- CreateTable Agency
CREATE TABLE IF NOT EXISTS "Agency" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "resetToken" TEXT,
    "resetTokenAt" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'basic',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Agency_hash_key" ON "Agency"("hash");
CREATE UNIQUE INDEX IF NOT EXISTS "Agency_email_key" ON "Agency"("email");

-- AddForeignKey (only if not exists — safe in PostgreSQL 12+)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Client_agencyId_fkey'
  ) THEN
    ALTER TABLE "Client" ADD CONSTRAINT "Client_agencyId_fkey"
      FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
