CREATE TABLE "TicketVerificationToken" (
  "id" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "TicketVerificationToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TicketVerificationToken_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TicketVerificationToken_tokenHash_key" ON "TicketVerificationToken"("tokenHash");
CREATE INDEX "TicketVerificationToken_ticketId_revokedAt_idx" ON "TicketVerificationToken"("ticketId", "revokedAt");
CREATE INDEX "TicketVerificationToken_expiresAt_idx" ON "TicketVerificationToken"("expiresAt");
