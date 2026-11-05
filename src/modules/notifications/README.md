# Notifications

The Nest CLI WebSockets resource generator created `notifications.module.ts`,
`notifications.gateway.ts`, and `notifications.service.ts` (no CRUD entry points).
The generated placeholders were replaced with a cookie-authenticated Socket.IO
namespace, a private per-user event broker, and a recipient-only HTTP inbox.

Call `NotificationsService.create` / `createMany` only **after** the business
transaction commits. The service skips the actor and catches insert/delivery
failures. Callers also catch notification failures so a successful action remains
successful even if the notification dependency fails. Ticket reporters use the
ticket's `createdById` / `createdBy` relation. The original CREATED activity is a
legacy fallback when `createdById` is absent. Status changes and comments notify
the reporter and assignees; assignment notifications target new assignees.

The gateway shares the API port and `CORS_ALLOWED_ORIGINS` (comma-separated exact
origins, credentials enabled, no wildcard). The server resolves Better Auth from
handshake cookies and chooses `user:<authenticated user id>` itself. There are no
client-controlled room joins. Inbox reads/updates are scoped to the logged-in
recipient across their organizations. Read events and counts update all their
tabs after the database write commits.

The frontend connects after login, disconnects on logout, and uses websocket-only
transport with reconnect backoff. HTTP loads the inbox on demand and refreshes the
count on reconnect or disconnected focus. There is no interval/polling loop.
Toasts queue until dismissed, without a timer. Frontend socket origins are set by
`notificationsSocketUrl` in each environment configuration. Production builds
derive that origin from the same `API_BASE_URL` build argument as the HTTP API;
the production environment strips the API path using `URL.origin`. No additional
repository variable or secret is required.

Verified 2026-11-04: project membership add/remove, manual project archive/restore,
ticket assignment/reassignment, ticket status changes, and comments are wired.
Timesheet submission notifies organization owners/admins; approval and rejection
notify the affected entry owners. Admin edits to another user's submitted entry
also notify that owner. Each hook runs after its business transaction commits.
The service skips the actor and deduplicates recipients per type/entity.

Notifications persist in the inbox, but failed inserts or socket delivery have no
durable retry queue. Failures are logged and do not roll back the business action.
Scheduling and email delivery remain outside this module's implemented scope.
