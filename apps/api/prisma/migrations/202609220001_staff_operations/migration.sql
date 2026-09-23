ALTER TABLE "User" ADD COLUMN "supervisorId" UUID;
ALTER TABLE "User" ADD CONSTRAINT "User_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED');
CREATE TYPE "CheckpointStatus" AS ENUM ('PLANNED', 'ACTIVE', 'CLOSED');
CREATE TABLE "Incident" (
 "id" UUID NOT NULL PRIMARY KEY, "requestKey" UUID NOT NULL,
 "reportedBy" UUID NOT NULL, "supervisorId" UUID NOT NULL,
 "type" TEXT NOT NULL, "description" TEXT NOT NULL, "location" TEXT NOT NULL,
 "latitude" DOUBLE PRECISION, "longitude" DOUBLE PRECISION,
 "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN', "resolutionNotes" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Incident_reportedBy_fkey" FOREIGN KEY ("reportedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "Incident_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "Incident_coordinates" CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180))
);
CREATE UNIQUE INDEX "Incident_requestKey_key" ON "Incident"("requestKey");
CREATE INDEX "Incident_reportedBy_createdAt_idx" ON "Incident"("reportedBy", "createdAt");
CREATE INDEX "Incident_supervisorId_status_idx" ON "Incident"("supervisorId", "status");
CREATE TABLE "Checkpoint" (
 "id" UUID NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "location" TEXT NOT NULL,
 "latitude" DOUBLE PRECISION NOT NULL, "longitude" DOUBLE PRECISION NOT NULL,
 "startAt" TIMESTAMP(3) NOT NULL, "endAt" TIMESTAMP(3) NOT NULL,
 "status" "CheckpointStatus" NOT NULL DEFAULT 'PLANNED', "createdBy" UUID NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Checkpoint_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "Checkpoint_coordinates" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180),
 CONSTRAINT "Checkpoint_dates" CHECK ("endAt" > "startAt")
);
CREATE INDEX "Checkpoint_status_startAt_idx" ON "Checkpoint"("status", "startAt");
CREATE TABLE "SystemSetting" ("key" TEXT PRIMARY KEY, "publicNotice" TEXT NOT NULL DEFAULT 'Fictional training environment. No real payments or enforcement.', "updatedAt" TIMESTAMP(3) NOT NULL);
