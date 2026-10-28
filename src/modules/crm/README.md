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

Legacy leads and subscribers intentionally remain public and organization-unscoped.
Their existing access decorators and behavior are unchanged.

Sending, providers, schedules, recipients, sync, and Apptivo overlap/reconciliation
are intentionally not built. Campaign content is stored only; nothing sends it.
