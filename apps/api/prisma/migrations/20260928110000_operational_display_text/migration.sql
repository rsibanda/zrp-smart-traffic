-- Display-only changes to known development fixtures. Keys, relationships,
-- credentials, audit history, ticket references and workflow states are preserved.
ALTER TABLE "SystemSetting" ALTER COLUMN "publicNotice" SET DEFAULT 'View current traffic notices and road information.';
UPDATE "SystemSetting" SET "publicNotice" = 'View current traffic notices and road information.'
WHERE "key" = 'demo' AND "publicNotice" = 'Fictional training environment. No real payments or enforcement.';

UPDATE "User" SET "name" = CASE "email"
  WHEN 'user@demo.invalid' THEN 'Tawanda Ncube'
  WHEN 'officer@demo.invalid' THEN 'Officer Tendai Moyo'
  WHEN 'officer2@demo.invalid' THEN 'Officer Rudo Dube'
  WHEN 'supervisor@demo.invalid' THEN 'Inspector Chipo Ndlovu'
  WHEN 'unassigned-supervisor@demo.invalid' THEN 'Inspector Farai Sibanda'
  WHEN 'admin@demo.invalid' THEN 'Nyasha Chirwa'
END
WHERE ("email", "name") IN (
  ('user@demo.invalid', 'Fictional user'), ('officer@demo.invalid', 'Fictional officer'),
  ('officer2@demo.invalid', 'Fictional officer2'), ('supervisor@demo.invalid', 'Fictional supervisor'),
  ('unassigned-supervisor@demo.invalid', 'Fictional unassigned-supervisor'), ('admin@demo.invalid', 'Fictional admin'));
UPDATE "User" SET "name" = 'Officer Tariro Dube'
WHERE "name" = 'Fictional browser test officer' AND "email" LIKE 'browser-%@demo.invalid';
UPDATE "OfficerProfile" SET "stationName" = 'Harare Central'
WHERE "stationName" = 'Fictional Training Station';
UPDATE "OfficerProfile" SET "badgeNumber" = 'ZRP-1042' WHERE "badgeNumber" = 'DEMO-OFFICER';
UPDATE "OfficerProfile" SET "badgeNumber" = 'ZRP-1043' WHERE "badgeNumber" = 'DEMO-OFFICER2';
UPDATE "Driver" SET "fullName" = 'Tawanda Ncube', "licenceNumber" = 'L0001042', "licenceStatus" = 'VALID'
WHERE "licenceNumber" = 'DEMO-LICENCE-001' AND "fullName" = 'Demo Driver One';
UPDATE "Vehicle" SET "registrationNumber" = 'ABC1234', "registrationStatus" = 'REGISTERED'
WHERE "registrationNumber" = 'DEMO001';
UPDATE "OffenceCategory" SET "name" = 'Traffic offence', "description" = 'General traffic offence observation.', "code" = 'TRF-001'
WHERE "code" = 'DEMO-OBS' AND "name" = 'Fictional training offence';
UPDATE "Checkpoint" SET "name" = 'Central Traffic Checkpoint'
WHERE "id" = 'd0000000-0000-4000-8000-000000000002' AND "name" = 'Demo training checkpoint';
UPDATE "Checkpoint" SET "location" = 'Samora Machel Avenue, Harare'
WHERE "id" = 'd0000000-0000-4000-8000-000000000002' AND "location" = 'Fictional operations area';
UPDATE "Incident" SET "location" = 'Samora Machel Avenue, Harare'
WHERE "requestKey" = 'd0000000-0000-4000-8000-000000000001' AND "location" = 'Demo training intersection';
UPDATE "Incident" SET "description" = 'Road obstruction reported near the intersection.'
WHERE "requestKey" = 'd0000000-0000-4000-8000-000000000001' AND "description" = 'Fictional training obstruction. This is not a real road alert.';
UPDATE "TrafficAlert" SET "title" = 'Traffic Advisory'
WHERE "id" = 'd0000000-0000-4000-8000-000000000003' AND "title" = 'Demo training notice';
UPDATE "TrafficAlert" SET "message" = 'Traffic information and road advisories will appear here.'
WHERE "id" = 'd0000000-0000-4000-8000-000000000003' AND "message" = 'Fictional classroom traffic exercise. This is not a real road closure or official alert.';

-- Known retained browser-check observations, not a blanket rewrite of user text.
UPDATE "Offence" SET "location" = 'Samora Machel Avenue, Harare'
WHERE "location" IN ('Fictional browser test area', 'Fictional public portal browser test')
AND "notes" IN ('Created by the local dashboard workflow check.', 'Demo ticket for browser payment simulation');
UPDATE "Offence" SET "notes" = 'Ticket issued for a recorded traffic observation.'
WHERE "notes" = 'Demo ticket for browser payment simulation';
UPDATE "Offence" SET "reviewNotes" = 'Observation confirmed following review.'
WHERE "reviewNotes" = 'Browser verification: fictional observation confirmed';
