-- GEO-110: subscriber status, tokens, custom values. Existing rows stay SUBSCRIBED.

CREATE TYPE "SubscriberStatus" AS ENUM ('SUBSCRIBED', 'UNSUBSCRIBED');

ALTER TABLE "newsletter_subscribers" ADD COLUMN "source" TEXT;
ALTER TABLE "newsletter_subscribers" ADD COLUMN "status" "SubscriberStatus" NOT NULL DEFAULT 'SUBSCRIBED';
ALTER TABLE "newsletter_subscribers" ADD COLUMN "unsubscribed_at" TIMESTAMP(3);
ALTER TABLE "newsletter_subscribers" ADD COLUMN "consent_at" TIMESTAMP(3);
ALTER TABLE "newsletter_subscribers" ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "newsletter_subscribers" ADD COLUMN "values" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "newsletter_subscribers" ADD COLUMN "unsubscribe_token" TEXT;

UPDATE "newsletter_subscribers"
SET
  "consent_at" = "created_at",
  "unsubscribe_token" = md5("id" || random()::text) || md5(random()::text || "id")
WHERE "unsubscribe_token" IS NULL;

ALTER TABLE "newsletter_subscribers" ALTER COLUMN "unsubscribe_token" SET NOT NULL;

CREATE UNIQUE INDEX "newsletter_subscribers_unsubscribe_token_key"
  ON "newsletter_subscribers"("unsubscribe_token");
CREATE INDEX "newsletter_subscribers_organization_id_is_archived_created_at_idx"
  ON "newsletter_subscribers"("organization_id", "is_archived", "created_at");
CREATE INDEX "newsletter_subscribers_organization_id_status_idx"
  ON "newsletter_subscribers"("organization_id", "status");

INSERT INTO "field_definitions" (
  "id", "organization_id", "collection", "key", "label", "type", "options",
  "is_required", "is_read_only", "is_system", "position", "created_at", "updated_at"
)
SELECT
  o."id" || ':subscriber:' || f."key",
  o."id",
  'subscriber'::"FieldCollection",
  f."key",
  f."label",
  f."type"::"FieldType",
  f."options",
  f."is_required",
  f."is_read_only",
  true,
  f."position",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organizations" o
CROSS JOIN (
  VALUES
    ('name', 'Name', 'text', ARRAY[]::TEXT[], false, false, 0),
    ('email', 'Email', 'text', ARRAY[]::TEXT[], true, false, 1),
    ('source', 'Source', 'url', ARRAY[]::TEXT[], false, false, 2),
    ('status', 'Status', 'select', ARRAY['SUBSCRIBED', 'UNSUBSCRIBED']::TEXT[], false, true, 3),
    ('consentAt', 'Consent date', 'datetime', ARRAY[]::TEXT[], false, true, 4)
) AS f("key", "label", "type", "options", "is_required", "is_read_only", "position");
