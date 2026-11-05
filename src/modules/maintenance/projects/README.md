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

## Apptivo read deadlines and retries

`APPTIVO_REQUEST_TIMEOUT_MS` defaults to 30000 (positive integer milliseconds).
Each GET attempt has an AbortSignal deadline covering headers and JSON body.
`APPTIVO_REQUEST_MAX_RETRIES` defaults to 2 and accepts 0 through 2. Network
failures, deadlines, and HTTP 429/502/503/504 retry with exponential backoff and
jitter (250-500 ms, then 500-750 ms). Other HTTP errors, including 401/403, and
invalid JSON fail immediately. Final errors identify the resource, page and
reason without including credentials. These settings affect only list reads.

Both customer and work-order lists finish before the reconciliation transaction
opens. Any failed page discards the collected list: no partial import or archive
occurs, and a later invocation fetches again from page 1. No scheduled sync was
added. Configuration is optional; no `.env.example` changes are needed.
