-- GEO-108: org-scope leads and subscribers without dropping rows.
-- Existing PENDING leads become NEW. Email uniqueness becomes (organization, email).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "organizations" WHERE "slug" = 'geoplan-philippines-inc') THEN
    RAISE EXCEPTION 'Default organization slug geoplan-philippines-inc is missing. Seed it before applying this migration.';
  END IF;
END $$;

ALTER TYPE "LeadStatus" RENAME VALUE 'PENDING' TO 'NEW';

ALTER TABLE "leads" ALTER COLUMN "status" SET DEFAULT 'NEW';
ALTER TABLE "leads" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "leads" ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;

UPDATE "leads"
SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'geoplan-philippines-inc');

ALTER TABLE "leads" ALTER COLUMN "organization_id" SET NOT NULL;

DROP INDEX "leads_email_key";
CREATE UNIQUE INDEX "leads_organization_id_email_key" ON "leads"("organization_id", "email");
CREATE INDEX "leads_organization_id_created_at_idx" ON "leads"("organization_id", "created_at");
CREATE INDEX "leads_organization_id_status_idx" ON "leads"("organization_id", "status");

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "newsletter_subscribers" ADD COLUMN "organization_id" TEXT;

UPDATE "newsletter_subscribers"
SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'geoplan-philippines-inc');

ALTER TABLE "newsletter_subscribers" ALTER COLUMN "organization_id" SET NOT NULL;

DROP INDEX "newsletter_subscribers_email_key";
CREATE UNIQUE INDEX "newsletter_subscribers_organization_id_email_key"
  ON "newsletter_subscribers"("organization_id", "email");
CREATE INDEX "newsletter_subscribers_organization_id_created_at_idx"
  ON "newsletter_subscribers"("organization_id", "created_at");

ALTER TABLE "newsletter_subscribers"
  ADD CONSTRAINT "newsletter_subscribers_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
