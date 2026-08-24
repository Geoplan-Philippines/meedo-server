/*
  Migration: Drop customer_name from projects
  - Backfill: Create Client records from orphaned project customer_names (deduped by name per org)
  - Link projects to their matched clients
  - Verify no projects remain unlinked
  - Drop customer_name column
*/

BEGIN;
-- 1. Fail loudly if any project needing a client has no usable customer_name.
--    This must run before any writes so a bad row aborts cleanly with no side effects.
DO $$
DECLARE
  invalid_count INTEGER;
  invalid_ids   TEXT;
BEGIN
  SELECT COUNT(*), string_agg(id, ', ' ORDER BY id)
  INTO invalid_count, invalid_ids
  FROM projects
  WHERE client_id IS NULL
    AND (customer_name IS NULL OR TRIM(customer_name) = '');
 
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % project(s) have no client and a NULL/blank customer_name, so a Client cannot be backfilled for them: %. Set customer_name or client_id manually, then re-run this migration.',
      invalid_count, invalid_ids;
  END IF;
END $$;


-- 2. Deduplicate any pre-existing Client rows that already share
--    (organization_id, customer_name). Canonical = oldest created_at,
--    tie-broken by lowest id. This must happen before backfill/linking so
--    step 5's UPDATE can never match more than one client per project.
CREATE TEMP TABLE _client_canonical AS
SELECT
  c.id AS client_id,
  first_value(c.id) OVER (
    PARTITION BY c.organization_id, c.customer_name
    ORDER BY c.created_at ASC, c.id ASC
  ) AS canonical_id
FROM clients c;
 
DO $$
DECLARE
  dup_report TEXT;
BEGIN
  SELECT string_agg(format('%s -> %s', client_id, canonical_id), ', ' ORDER BY client_id)
  INTO dup_report
  FROM _client_canonical
  WHERE client_id <> canonical_id;
 
  IF dup_report IS NOT NULL THEN
    RAISE NOTICE 'Duplicate clients found and merged (duplicate_id -> canonical_id): %', dup_report;
  END IF;
END $$;
 
-- Repoint any project already linked to a duplicate onto the canonical client
UPDATE projects p
SET client_id = cc.canonical_id
FROM _client_canonical cc
WHERE p.client_id = cc.client_id
  AND cc.client_id <> cc.canonical_id;
 
-- Remove the now-unreferenced duplicate client rows
DELETE FROM clients c
USING _client_canonical cc
WHERE c.id = cc.client_id
  AND cc.client_id <> cc.canonical_id;
 
DROP TABLE _client_canonical;

-- 3. Create Client records for customer_names that don't yet have a matching client
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

-- 4. Link orphaned projects to their matched clients
UPDATE projects p
SET client_id = c.id
FROM clients c
WHERE p.client_id IS NULL
  AND c.organization_id = p.organization_id
  AND c.customer_name = p.customer_name;

-- 5. Verify no projects remain unlinked
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM projects WHERE client_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Migration failed: % projects remain without a linked client after backfill. All projects must have a client before dropping customer_name.', orphan_count;
  END IF;
END $$;

-- 6. Drop the denormalized customer_name column
ALTER TABLE projects DROP COLUMN customer_name;

-- 7. Enforce uniqueness going forward: no two clients in the same org may share a customer_name
ALTER TABLE clients
ADD CONSTRAINT clients_organization_id_customer_name_key
UNIQUE (organization_id, customer_name);

COMMIT;