-- User-configured demonstration values, not statutory Zimbabwe penalties.
-- Reuse category IDs to preserve offence relationships. Ticket snapshots and
-- driver ledger entries are deliberately untouched. Later admin edits remain
-- configurable: this migration runs once, and seed does not overwrite it.
DO $$
DECLARE
  example RECORD;
  existing_id UUID;
BEGIN
  FOR example IN SELECT * FROM (VALUES
    ('TRF-SPD', 'Speeding', 50, 3, 'Speeding'),
    ('TRF-DUI', 'Drunk driving (DUI)', 200, 6, 'Drunk driving (DUI)'),
    ('TRF-RED', 'Running a red light', 80, 4, 'Running a red light'),
    ('TRF-PHN', 'Mobile phone use while driving', 40, 3, 'Mobile phone use while driving'),
    ('TRF-REC', 'Reckless driving', 150, 6, 'Reckless driving'),
    ('TRF-LIC', 'Driving without a valid licence', 100, 5, 'Driving without valid licence'),
    ('TRF-BEL', 'Failure to wear a seatbelt', 30, 2, 'Failure to wear a seatbelt'),
    ('TRF-PAR', 'Illegal parking', 25, 0, 'Illegal parking'),
    ('TRF-REG', 'Driving an unregistered vehicle', 75, 3, 'Driving an unregistered vehicle'),
    ('TRF-SGN', 'Failure to obey traffic signs', 40, 2, 'Failure to obey traffic signs')
  ) AS defaults(code, name, amount, points, previous_name)
  LOOP
    -- Match the existing code or equivalent label instead of adding duplicates.
    -- Ambiguous pre-existing duplicates require explicit administrator review.
    IF (SELECT count(*) FROM "OffenceCategory"
        WHERE "code" = example.code
          OR lower(trim("name")) IN (lower(example.name), lower(example.previous_name))) > 1 THEN
      RAISE EXCEPTION 'Duplicate offence catalogue entries for %; reconcile before migration', example.code;
    END IF;
    SELECT "id" INTO existing_id FROM "OffenceCategory"
      WHERE "code" = example.code
        OR lower(trim("name")) IN (lower(example.name), lower(example.previous_name));
    IF existing_id IS NULL THEN
      INSERT INTO "OffenceCategory"
        ("id", "code", "name", "description", "demoFineAmount", "demeritPoints", "paymentDueDays", "active")
      VALUES (gen_random_uuid(), example.code, example.name,
        'Configurable demonstration penalty; not an official tariff.',
        example.amount, example.points, 30, true);
    ELSE
      UPDATE "OffenceCategory" SET "name" = example.name,
        "demoFineAmount" = example.amount, "demeritPoints" = example.points
      WHERE "id" = existing_id;
    END IF;
  END LOOP;
END $$;
