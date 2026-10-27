/*
  First response = the first time a ticket is assigned to an employee.

  Backfills tickets.first_responded_at for tickets that currently have an
  assignee, using the earliest ASSIGNEE_CHANGED activity whose "to" list is
  non-empty. Tickets with no such activity (for example, ones created with
  assignees, which only log CREATED) stay NULL. Rows that already have a value
  are not touched. Data only; no schema change.
*/

UPDATE "tickets" AS t
SET "first_responded_at" = first_assignment.assigned_at
FROM (
    SELECT a."ticket_id", MIN(a."created_at") AS assigned_at
    FROM "ticket_activities" AS a
    WHERE a."type" = 'ASSIGNEE_CHANGED'
      AND jsonb_typeof(a."meta" -> 'to') = 'array'
      AND jsonb_array_length(a."meta" -> 'to') > 0
    GROUP BY a."ticket_id"
) AS first_assignment
WHERE t."id" = first_assignment."ticket_id"
  AND t."first_responded_at" IS NULL
  AND EXISTS (SELECT 1 FROM "ticket_assignees" AS ta WHERE ta."ticket_id" = t."id");
