ALTER TABLE "Incident" ALTER COLUMN "reportedBy" DROP NOT NULL;
ALTER TABLE "Incident" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'OFFICER';
CREATE TABLE "PublicTicketAccess" (
 "ticketId" UUID PRIMARY KEY REFERENCES "Ticket"("id") ON DELETE CASCADE,
 "codeHash" TEXT NOT NULL, "paidAt" TIMESTAMP(3), "receiptReference" TEXT UNIQUE
);
CREATE TABLE "PublicTicketSession" (
 "tokenHash" TEXT PRIMARY KEY, "ticketId" UUID NOT NULL REFERENCES "PublicTicketAccess"("ticketId") ON DELETE CASCADE,
 "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "PublicTicketSession_expiresAt_idx" ON "PublicTicketSession"("expiresAt");
CREATE TABLE "TrafficAlert" (
 "id" UUID PRIMARY KEY, "title" TEXT NOT NULL, "message" TEXT NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT true, "createdBy" UUID NOT NULL REFERENCES "User"("id"),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Evidence" (
 "id" UUID PRIMARY KEY, "offenceId" UUID NOT NULL REFERENCES "Offence"("id"),
 "privateStorageKey" TEXT NOT NULL UNIQUE, "mimeType" TEXT NOT NULL, "byteSize" INTEGER NOT NULL,
 "sha256" TEXT NOT NULL, "uploadedBy" UUID NOT NULL REFERENCES "User"("id"),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("offenceId", "sha256")
);
