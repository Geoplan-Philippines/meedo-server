# Internal projects and membership

`apptivoId = null` identifies an internal client/project. PostgreSQL retains the
organization/source-ID unique constraints and allows multiple null source IDs.
Sync reconciliation and archive queries skip null IDs and the existing seed ID
prefixes (`seed-`, `local-timesheet-`). No scheduled sync was added.

Projects start open (`isClosed = false`), not manually archived, and without any
members. Existing projects also start without members, so only organization
owners/admins can see them until members are assigned. Ordinary members see only
their assigned projects and clients containing those projects. The sidebar and
both project pickers apply the same membership condition. Closing is informational
and never blocks tickets, SLA, or timesheet support.

Owners/admins create internal records, manage project membership, set Closed, and
archive/restore. `archivedManually` prevents reconciliation from modifying or
unarchiving a manually archived project. Restore clears it. Existing display-name
editing and client-link behavior remain in place; this change adds no client
clearing or expanded editing fields. Existing anonymous decorators and manual
sync entry points are unchanged.
