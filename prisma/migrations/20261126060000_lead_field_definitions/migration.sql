-- GEO-109: shared field definitions and lead custom values. Existing lead rows stay.

CREATE TYPE "FieldCollection" AS ENUM ('lead', 'subscriber');
CREATE TYPE "FieldType" AS ENUM ('text', 'long_text', 'number', 'select', 'url', 'date', 'datetime');

ALTER TABLE "leads" ADD COLUMN "source" TEXT;
ALTER TABLE "leads" ADD COLUMN "values" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "leads" ADD COLUMN "received_at" TIMESTAMP(3);

UPDATE "leads" SET "received_at" = "created_at" WHERE "received_at" IS NULL;

ALTER TABLE "leads" ALTER COLUMN "received_at" SET NOT NULL;
ALTER TABLE "leads" ALTER COLUMN "received_at" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "leads_organization_id_is_archived_created_at_idx"
  ON "leads"("organization_id", "is_archived", "created_at");

CREATE TABLE "field_definitions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "collection" "FieldCollection" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "FieldType" NOT NULL,
    "options" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_read_only" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "field_definitions_organization_id_collection_key_key"
  ON "field_definitions"("organization_id", "collection", "key");
CREATE INDEX "field_definitions_organization_id_collection_position_idx"
  ON "field_definitions"("organization_id", "collection", "position");

ALTER TABLE "field_definitions"
  ADD CONSTRAINT "field_definitions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "field_definitions" (
  "id", "organization_id", "collection", "key", "label", "type", "options",
  "is_required", "is_read_only", "is_system", "position", "created_at", "updated_at"
)
SELECT
  o."id" || ':lead:' || f."key",
  o."id",
  'lead'::"FieldCollection",
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
    ('firstName', 'First name', 'text', ARRAY[]::TEXT[], true, false, 0),
    ('lastName', 'Last name', 'text', ARRAY[]::TEXT[], true, false, 1),
    ('email', 'Email', 'text', ARRAY[]::TEXT[], true, false, 2),
    ('company', 'Company', 'text', ARRAY[]::TEXT[], false, false, 3),
    ('phoneNumber', 'Phone', 'text', ARRAY[]::TEXT[], false, false, 4),
    ('message', 'Message', 'long_text', ARRAY[]::TEXT[], true, false, 5),
    ('source', 'Source', 'url', ARRAY[]::TEXT[], false, false, 6),
    ('status', 'Status', 'select', ARRAY['NEW', 'CONTACTED', 'QUALIFIED', 'LOST']::TEXT[], false, true, 7),
    ('isArchived', 'Archived', 'select', ARRAY['true', 'false']::TEXT[], false, true, 8),
    ('receivedAt', 'Received', 'datetime', ARRAY[]::TEXT[], false, true, 9)
) AS f("key", "label", "type", "options", "is_required", "is_read_only", "position");
