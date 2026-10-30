-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "identityVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "motoristId" UUID;

-- AlterTable
ALTER TABLE "Offence" ADD COLUMN     "driverConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "responsibleDriverId" UUID;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "pointsAssessment" TEXT NOT NULL DEFAULT 'LEGACY_NOT_ASSESSED';

-- CreateTable
CREATE TABLE "DriverPointsPolicy" (
    "key" TEXT NOT NULL,
    "allowance" INTEGER NOT NULL DEFAULT 12,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverPointsPolicy_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "DriverPointsAccount" (
    "driverId" UUID NOT NULL,
    "startingAllowance" INTEGER NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverPointsAccount_pkey" PRIMARY KEY ("driverId")
);

-- CreateTable
CREATE TABLE "DriverPointsLedger" (
    "id" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "ticketId" UUID,
    "event" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "actorId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverPointsLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverPointsLedger_driverId_createdAt_idx" ON "DriverPointsLedger"("driverId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DriverPointsLedger_ticketId_event_key" ON "DriverPointsLedger"("ticketId", "event");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_motoristId_key" ON "Driver"("motoristId");

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_motoristId_fkey" FOREIGN KEY ("motoristId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPointsAccount" ADD CONSTRAINT "DriverPointsAccount_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPointsLedger" ADD CONSTRAINT "DriverPointsLedger_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverPointsAccount"("driverId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPointsLedger" ADD CONSTRAINT "DriverPointsLedger_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPointsLedger" ADD CONSTRAINT "DriverPointsLedger_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offence" ADD CONSTRAINT "Offence_responsibleDriverId_fkey" FOREIGN KEY ("responsibleDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;


CREATE UNIQUE INDEX "DriverPointsLedger_one_opening" ON "DriverPointsLedger" ("driverId") WHERE "event" = 'OPENING';
ALTER TABLE "DriverPointsLedger" ADD CONSTRAINT "DriverPointsLedger_event_delta" CHECK (("event"='OPENING' AND "delta">0 AND "ticketId" IS NULL) OR ("event"='ISSUANCE' AND "delta"<=0 AND "ticketId" IS NOT NULL) OR ("event"='CANCELLATION' AND "delta">=0 AND "ticketId" IS NOT NULL));
INSERT INTO "DriverPointsPolicy" ("key", "allowance", "version", "updatedAt") VALUES ('default', 12, 1, CURRENT_TIMESTAMP);
