# Apptivo work order sync — handover notes

Covers `src/modules/maintenance/work-orders/`. Written for whoever picks this up next.

## What the sync is

Apptivo is the upstream ERP. `POST /maintenance/work-orders/sync` pulls the full work
order list and reconciles it into the local `work_orders` table. Apptivo is the source of
truth for these rows: nothing in Meedo should create or edit a work order by hand.

The sync runs clients first (`ClientsService.syncClientsFromApptivo`), because a work
order is linked to a `Client` by the Apptivo customer id.

## Renamed from `Project`

The model used to be called `Project` and the table used to be `projects`. It was renamed
to `WorkOrder` / `work_orders` so that `Project` could be used for the Linear-style
delivery projects that tickets now live in. Those are two genuinely different things:

| Concept | Model | Owned by | Can be deleted by sync |
|---|---|---|---|
| Apptivo work order | `WorkOrder` | Apptivo sync | No — archived only |
| Delivery project | `Project` | Meedo users | Never touched by sync |

A `Project` may point at a `WorkOrder` through the optional `workOrderId` column for
client/billing context. That link is deliberately optional and one-directional, so user
created projects are never at the mercy of the sync.

If you are searching the history: the timesheet and SLA foreign keys were renamed in the
same pass (`timesheet_entries.project_id` → `work_order_id`, `sla_policies.project_id` →
`work_order_id`).

## The reconcile is non-destructive — do not "fix" it back

The sync used to end with:

```ts
this.prisma.project.deleteMany({
  where: { organizationId, apptivoId: { notIn: apptivoIds } },
});
```

That had two problems serious enough to change the behaviour:

1. **It hard-deleted.** Work orders are referenced by tickets (`onDelete: SetNull`, so
   they were silently orphaned) and by timesheet entries (`onDelete: Restrict`, so the
   delete threw and failed the whole sync transaction). Once an organization had logged
   any time against a work order that later left the Apptivo feed, every subsequent sync
   would fail.
2. **The keep-list was too narrow.** `apptivoIds` was built from `validProjects` — only
   the work orders that resolved to a known client. A work order present in Apptivo but
   whose customer was missing from the client map got skipped for upsert *and* deleted.
   A transient gap in client data destroyed live rows.

It now archives instead:

```ts
this.prisma.workOrder.updateMany({
  where: { organizationId, apptivoId: { notIn: seenApptivoIds }, isArchived: false },
  data: { isArchived: true, archivedAt: new Date() },
});
```

with three protections:

- `seenApptivoIds` covers **every** work order Apptivo returned, including ones that could
  not be linked to a client. Unlinkable rows are skipped for upsert but never archived.
- An empty feed returns early without reconciling, so an upstream hiccup cannot archive
  the entire table.
- Re-appearing work orders are un-archived by the upsert (`isArchived: false,
  archivedAt: null`), so archiving is fully reversible.

Archived work orders are hidden from `GET /maintenance/work-orders` unless you pass
`?includeArchived=true`. Existing tickets and timesheet entries still resolve their work
order normally.

Nothing purges `work_orders` any more. If you ever need real deletion, do it as an
explicit admin action that checks for dependent tickets and timesheet entries first —
not inside the sync.

## Known gaps

- `normalizeWorkOrder` does not populate `customerName`; the column keeps its `""`
  default and the display name comes from the joined `Client`. Pre-existing behaviour,
  left as-is.
- The timesheet HTTP contract was renamed to match: request bodies and query params now
  take `workOrderId`, and entries come back with `workOrderId` / `workOrder` instead of
  `projectId` / `project`. The Angular timesheet module was updated at the wire boundary
  only — its internal grid state and its user-facing "Project" labels still say project,
  because that is the word the timesheet UI has always shown. Changing that copy is a
  separate, user-visible decision.
- `ClientsService.syncClientsFromApptivo` still hard-deletes clients that leave the feed.
  It was left alone in this pass. It has the same shape of risk as the work order purge
  did, so it is the obvious next thing to harden.
