CREATE TABLE "OffenceCharge" (
  "offenceId" UUID NOT NULL REFERENCES "Offence"("id") ON DELETE CASCADE,
  "categoryId" UUID NOT NULL REFERENCES "OffenceCategory"("id"),
  "nameSnapshot" TEXT,
  "fineSnapshot" DECIMAL(10,2),
  "pointsSnapshot" INTEGER,
  PRIMARY KEY ("offenceId", "categoryId")
);
-- Preserve every existing issued fine/points snapshot, including cancelled tickets.
INSERT INTO "OffenceCharge" ("offenceId", "categoryId", "nameSnapshot", "fineSnapshot", "pointsSnapshot")
SELECT o.id, o."categoryId", CASE WHEN t.id IS NOT NULL THEN c.name END,
       t."demoFineAmountSnapshot", t."demeritPointsSnapshot"
FROM "Offence" o JOIN "OffenceCategory" c ON c.id = o."categoryId"
LEFT JOIN "Ticket" t ON t."offenceId" = o.id;
