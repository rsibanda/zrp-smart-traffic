-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('LEGACY', 'ECOCASH', 'INNBUCKS', 'CARD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'TIMED_OUT');

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "motoristId" UUID;

-- AlterTable
ALTER TABLE "OffenceCategory" ADD COLUMN     "demeritPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentDueDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "demeritPointsSnapshot" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "motoristId" UUID;

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "requestKey" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "motoristId" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UNITS',
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PROCESSING',
    "last4" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "receiptReference" TEXT,
    "failureReason" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymentReference_key" ON "Payment"("paymentReference");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_requestKey_key" ON "Payment"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_receiptReference_key" ON "Payment"("receiptReference");

-- CreateIndex
CREATE INDEX "Payment_motoristId_createdAt_idx" ON "Payment"("motoristId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_ticketId_status_idx" ON "Payment"("ticketId", "status");

-- CreateIndex
CREATE INDEX "Vehicle_motoristId_idx" ON "Vehicle"("motoristId");

-- CreateIndex
CREATE INDEX "Ticket_motoristId_issuedAt_idx" ON "Ticket"("motoristId", "issuedAt");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_motoristId_fkey" FOREIGN KEY ("motoristId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_motoristId_fkey" FOREIGN KEY ("motoristId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_motoristId_fkey" FOREIGN KEY ("motoristId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defence in depth: one completed payment per ticket, including legacy access.
CREATE UNIQUE INDEX "Payment_one_success_per_ticket" ON "Payment"("ticketId") WHERE "status" = 'SUCCESS';
ALTER TABLE "OffenceCategory" ADD CONSTRAINT "category_points_range" CHECK ("demeritPoints" BETWEEN 0 AND 100);
ALTER TABLE "OffenceCategory" ADD CONSTRAINT "category_due_days_range" CHECK ("paymentDueDays" BETWEEN 1 AND 365);
