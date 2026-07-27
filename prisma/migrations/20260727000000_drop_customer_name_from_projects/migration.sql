/*
  Migration: Drop customer_name from projects
  - Backfill: Create Client records from orphaned project customer_names (deduped by name per org)
  - Link projects to their matched clients
  - Verify no projects remain unlinked
  - Drop customer_name column
*/

BEGIN;

-- 1. Create Client records for customer_names that don't yet have a matching client
INSERT INTO clients (id, apptivo_id, customer_name, organization_id, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  'migrated-' || gen_random_uuid()::text,
  p.customer_name,
  p.organization_id,
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT p.customer_name, p.organization_id
  FROM projects p
  WHERE p.client_id IS NULL
) p
WHERE NOT EXISTS (
  SELECT 1 FROM clients c
  WHERE c.organization_id = p.organization_id
    AND c.customer_name = p.customer_name
);

-- 2. Link orphaned projects to their matched clients
UPDATE projects p
SET client_id = c.id
FROM clients c
WHERE p.client_id IS NULL
  AND c.organization_id = p.organization_id
  AND c.customer_name = p.customer_name;

-- 3. Verify no projects remain unlinked
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM projects WHERE client_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Migration failed: % projects remain without a linked client after backfill. All projects must have a client before dropping customer_name.', orphan_count;
  END IF;
END $$;

-- 4. Drop the denormalized customer_name column
ALTER TABLE projects DROP COLUMN customer_name;

COMMIT;
