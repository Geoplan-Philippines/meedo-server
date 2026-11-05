-- Meedo owns names, links and state. Internal records have no Apptivo references.
ALTER TABLE "projects"
  ALTER COLUMN "work_order_number" DROP NOT NULL,
  ALTER COLUMN "customer_name" DROP NOT NULL,
  ALTER COLUMN "customer_name" DROP DEFAULT,
  ADD COLUMN "missing_from_apptivo_at" TIMESTAMP(3);
ALTER TABLE "clients"
  ALTER COLUMN "customer_name" DROP NOT NULL,
  ADD COLUMN "missing_from_apptivo_at" TIMESTAMP(3);

-- Retain the legacy value for historical audits, but retire its application behavior.
COMMENT ON COLUMN "projects"."client_locked" IS
  'Retired: client links are always Meedo-owned; no sync or edit behavior uses this column.';

-- Preserve readable Meedo names before clearing legacy internal/seed source placeholders.
UPDATE "clients"
SET "display_name" = COALESCE(NULLIF(BTRIM("display_name"), ''), "customer_name"),
    "apptivo_id" = NULL, "customer_name" = NULL
WHERE ("apptivo_id" IS NULL OR "apptivo_id" LIKE 'seed-%' OR "apptivo_id" LIKE 'local-timesheet-%')
  AND ("apptivo_id" IS NOT NULL OR "customer_name" IS NOT NULL);

UPDATE "projects"
SET "display_name" = COALESCE(NULLIF(BTRIM("display_name"), ''), NULLIF(BTRIM("quote_subject"), ''), "work_order_number"),
    "apptivo_id" = NULL, "work_order_number" = NULL, "customer_name" = NULL,
    "quote_subject" = NULL, "apptivo_quote_ref_id" = NULL
WHERE ("apptivo_id" IS NULL OR "apptivo_id" LIKE 'seed-%' OR "apptivo_id" LIKE 'local-timesheet-%')
  AND ("apptivo_id" IS NOT NULL OR "work_order_number" IS NOT NULL OR "customer_name" IS NOT NULL
       OR "quote_subject" IS NOT NULL OR "apptivo_quote_ref_id" IS NOT NULL);
