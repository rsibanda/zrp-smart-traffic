-- AlterEnum
ALTER TYPE "VehicleRequestKind" ADD VALUE 'APPLICATION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VehicleRequestStatus" ADD VALUE 'DRAFT';
ALTER TYPE "VehicleRequestStatus" ADD VALUE 'PENDING_REVIEW';
ALTER TYPE "VehicleRequestStatus" ADD VALUE 'APPROVED';
ALTER TYPE "VehicleRequestStatus" ADD VALUE 'CHANGES_REQUESTED';

-- CreateTable
CREATE TABLE "VehicleCategory" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "feeMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleApplication" (
    "requestId" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "colour" TEXT NOT NULL,
    "chassis" TEXT NOT NULL,
    "engine" TEXT NOT NULL DEFAULT '',
    "relationship" TEXT NOT NULL,
    "declaration" BOOLEAN NOT NULL DEFAULT false,
    "feeMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleApplication_pkey" PRIMARY KEY ("requestId")
);

-- CreateTable
CREATE TABLE "VehicleApplicationFile" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleApplicationFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleApplicationDecision" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "status" "VehicleRequestStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "reviewerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleApplicationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleApplicationPayment" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "receiptReference" TEXT,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PROCESSING',
    "feeMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "VehicleApplicationPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleCategory_code_key" ON "VehicleCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleApplication_requestKey_key" ON "VehicleApplication"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleApplicationFile_storageKey_key" ON "VehicleApplicationFile"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleApplicationFile_applicationId_kind_key" ON "VehicleApplicationFile"("applicationId", "kind");

-- CreateIndex
CREATE INDEX "VehicleApplicationDecision_applicationId_createdAt_idx" ON "VehicleApplicationDecision"("applicationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleApplicationPayment_requestKey_key" ON "VehicleApplicationPayment"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleApplicationPayment_reference_key" ON "VehicleApplicationPayment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleApplicationPayment_receiptReference_key" ON "VehicleApplicationPayment"("receiptReference");

-- CreateIndex
CREATE INDEX "VehicleApplicationPayment_applicationId_createdAt_idx" ON "VehicleApplicationPayment"("applicationId", "createdAt");

-- AddForeignKey
ALTER TABLE "VehicleApplication" ADD CONSTRAINT "VehicleApplication_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "VehicleLinkRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleApplication" ADD CONSTRAINT "VehicleApplication_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "VehicleCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleApplicationFile" ADD CONSTRAINT "VehicleApplicationFile_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VehicleApplication"("requestId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleApplicationDecision" ADD CONSTRAINT "VehicleApplicationDecision_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VehicleApplication"("requestId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleApplicationPayment" ADD CONSTRAINT "VehicleApplicationPayment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VehicleApplication"("requestId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "VehicleApplicationPayment_one_success" ON "VehicleApplicationPayment" ("applicationId") WHERE "status" = 'SUCCESS';

ALTER TABLE "VehicleApplicationFile" ADD CONSTRAINT "VehicleApplicationFile_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleApplicationDecision" ADD CONSTRAINT "VehicleApplicationDecision_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleCategory" ADD CONSTRAINT "VehicleCategory_fee_check" CHECK ("feeMinor" >= 0);
ALTER TABLE "VehicleApplication" ADD CONSTRAINT "VehicleApplication_fee_check" CHECK ("feeMinor" >= 0);
