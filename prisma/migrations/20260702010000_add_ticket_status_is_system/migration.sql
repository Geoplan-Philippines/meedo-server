-- Mark built-in "standard" statuses so they can't be edited/archived/deleted
-- and can be seeded per organization.
ALTER TABLE "ticket_status" ADD COLUMN "is_system" BOOLEAN NOT NULL DEFAULT false;
