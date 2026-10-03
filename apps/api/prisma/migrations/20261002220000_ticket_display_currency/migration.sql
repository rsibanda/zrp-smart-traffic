-- Add a presentation reference; preserve existing opaque lookup keys and verification codes.
CREATE SEQUENCE "ticket_display_number";
CREATE FUNCTION next_ticket_reference() RETURNS text LANGUAGE plpgsql AS $$
DECLARE number text;
BEGIN
  number := nextval('"ticket_display_number"')::text;
  RETURN 'INF-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(number, greatest(6, length(number)), '0');
END;
$$;
ALTER TABLE "Ticket" ADD COLUMN "displayReference" TEXT;
UPDATE "Ticket" SET "displayReference" = 'INF-' || to_char("issuedAt", 'YYYY') || '-' || lpad(nextval('"ticket_display_number"')::text, 6, '0');
ALTER TABLE "Ticket" ALTER COLUMN "displayReference" SET DEFAULT next_ticket_reference();
ALTER TABLE "Ticket" ALTER COLUMN "displayReference" SET NOT NULL;
CREATE UNIQUE INDEX "Ticket_displayReference_key" ON "Ticket"("displayReference");
-- Synthetic amounts retain their numeric value; this is a display denomination, not a financial conversion.
ALTER TABLE "Payment" ALTER COLUMN "currency" SET DEFAULT 'USD';
UPDATE "Payment" SET "currency" = 'USD' WHERE "currency" = 'UNITS';
