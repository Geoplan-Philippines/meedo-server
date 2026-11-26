# CRM

One CRM module composes submodules without moving existing code:

- `leads/`: existing controller, service, DTOs and specs.
- `newsletter/subscribers/`: existing controller, service, DTOs and specs.
- `newsletter/campaigns/`: authenticated, organization-scoped drafts and archives;
  controller, service, DTOs, shared limits, and specs.

Add future CRM areas as sibling submodules here (or under `newsletter/` for
newsletter-specific features), each with its own module, controller, service,
DTOs and specs. Register modules through CRM; avoid adding unrelated providers.

New areas follow tickets/settings conventions: `CurrentOrganizationId` and
`CurrentUser`, compound organization/user membership lookup, the shared admin
role helper, validated DTOs, Swagger, global response wrapping, and shared
pagination metadata. Reads require membership; campaign mutations require
owner/admin. Never accept organization or actor IDs from request bodies.

Campaign limits are name 200, subject 200 and stored body 20,000 characters.
Trim required text before validation. Updates only affect drafts; archive and
restore are scoped state transitions, with no hard-delete endpoint.

Lead and subscriber list reads require a login and membership in the active
organization. Anonymous `POST /crm/leads` and `POST /crm/newsletter/subscribers`
still assign the seeded default organization `geoplan-philippines-inc`. Email is
unique per organization and lowercased at write. `LeadStatus` uses `NEW` rather
than `PENDING`.

Lead custom fields live in `field_definitions` (`collection = lead`) with values
in `leads.values`. System field keys are locked. Authenticated lead detail,
status, archive, restore, manual create, and CSV export are org-scoped.

Subscribers use the same field-definition table (`collection = subscriber`) with
`SUBSCRIBED` / `UNSUBSCRIBED` status, archive, export, and real stats. Public
`GET` and `POST /public/unsubscribe/:token` are anonymous and idempotent and
return the same confirmation whether the token is valid.

Sending, providers, schedules, recipients, sync, and Apptivo overlap/reconciliation
are intentionally not built. Campaign content is stored only; nothing sends it.
