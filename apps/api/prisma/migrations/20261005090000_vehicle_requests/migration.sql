ALTER TABLE "Vehicle" ADD COLUMN "nickname" TEXT, ADD COLUMN "linkVerifiedAt" TIMESTAMP(3);
CREATE TYPE "VehicleRequestKind" AS ENUM ('LINK', 'UNLINK');
CREATE TYPE "VehicleRequestStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
CREATE TABLE "VehicleLinkRequest" (
  "id" UUID NOT NULL PRIMARY KEY,
  "motoristId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "registration" TEXT NOT NULL,
  "kind" "VehicleRequestKind" NOT NULL DEFAULT 'LINK',
  "status" "VehicleRequestStatus" NOT NULL DEFAULT 'PENDING',
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" UUID REFERENCES "User"("id"),
  "reviewNote" TEXT
);
CREATE INDEX "VehicleLinkRequest_motoristId_submittedAt_idx" ON "VehicleLinkRequest"("motoristId", "submittedAt");
CREATE INDEX "VehicleLinkRequest_status_submittedAt_idx" ON "VehicleLinkRequest"("status", "submittedAt");
CREATE UNIQUE INDEX "VehicleLinkRequest_one_pending" ON "VehicleLinkRequest"("motoristId", "registration", "kind") WHERE "status" = 'PENDING';
