ALTER TYPE "Role" ADD VALUE 'USER';

-- Existing anonymous ticket sessions must verify again after account sign-in.
-- Ticket, payment and operational records are preserved.
DELETE FROM "PublicTicketSession";
ALTER TABLE "PublicTicketSession" ADD COLUMN "accountSessionId" UUID NOT NULL;
ALTER TABLE "PublicTicketSession" ADD CONSTRAINT "PublicTicketSession_accountSessionId_fkey"
  FOREIGN KEY ("accountSessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "PublicTicketSession_accountSessionId_idx" ON "PublicTicketSession"("accountSessionId");
