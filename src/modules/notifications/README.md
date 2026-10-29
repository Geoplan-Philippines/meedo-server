# Notifications

The Nest CLI WebSockets resource generator created `notifications.module.ts`,
`notifications.gateway.ts`, and `notifications.service.ts` (no CRUD entry points).
The generated placeholders were replaced with a cookie-authenticated Socket.IO
namespace, a private per-user event broker, and a recipient-only HTTP inbox.

Call `NotificationsService.create` / `createMany` only **after** the business
transaction commits. The service skips the actor and catches insert/delivery
failures. Callers also catch notification failures so a successful action remains
successful even if the notification dependency fails. Ticket reporters are
resolved from their original CREATED activity; the existing ticket schema has no
separate reporter field.

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
`notificationsSocketUrl` in each environment configuration.

Wired: project membership add/remove, manual project archive/restore, ticket
assignment/reassignment, ticket status changes, and comments. The three timesheet
notification types are reserved constants only; timesheet submission/approval/
rejection and scheduling are intentionally not wired.
