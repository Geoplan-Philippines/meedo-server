-- Indexes for the paged list queries. Additive only: no data changes.

-- Ticket list: the organization's unarchived tickets, newest first. Page 1 reads
-- 25 index entries instead of sorting every ticket.
CREATE INDEX "tickets_organization_id_is_archived_created_at_idx" ON "tickets"("organization_id", "is_archived", "created_at");

-- Leads and newsletter subscribers lists: newest first across the whole table.
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");

CREATE INDEX "newsletter_subscribers_created_at_idx" ON "newsletter_subscribers"("created_at");
