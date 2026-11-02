-- Illustrative academic processing fees only, never statutory fees.
-- This new catalogue has no pre-existing equivalent in the audited schema.
INSERT INTO "VehicleCategory" ("id", "code", "label", "feeMinor", "currency", "active", "updatedAt")
SELECT gen_random_uuid(), code, label, fee, 'USD', true, CURRENT_TIMESTAMP
FROM (VALUES
  ('MC', 'Motorcycle / scooter', 500),
  ('PC', 'Private car (hatchback / sedan)', 1000),
  ('SUV', 'SUV / 4x4', 1500),
  ('TAXI', 'Taxi / ride-hailing vehicle', 1500),
  ('VAN', 'Van / light commercial', 2000),
  ('MINI', 'Minibus / commuter omnibus', 2000),
  ('BUS', 'Bus / coach', 2500),
  ('TRUCK', 'Truck / goods vehicle', 3000),
  ('HEAVY', 'Heavy goods vehicle', 4000),
  ('TRAILER', 'Trailer', 1000),
  ('SPECIAL', 'Special-purpose / agricultural vehicle', 2500)
) AS examples(code, label, fee)
WHERE NOT EXISTS (SELECT 1 FROM "VehicleCategory");
