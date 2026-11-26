export function buildIntegrationGuide(baseUrl: string): string {
  const origin = baseUrl.replace(/\/$/, '');
  return `# Meedo website integration

Use this guide to send leads and newsletter subscribers from a public website into Meedo.

## Paste this to your AI agent

Connect this website to Meedo. Read ${origin}/api/v1/docs/integration.md and use the Meedo integration key in the MEEDO_INTEGRATION_KEY environment variable. Submit leads to POST ${origin}/api/v1/public/{orgSlug}/leads and subscribers to POST ${origin}/api/v1/public/{orgSlug}/subscribers. Send JSON {"values":{...}} with header x-integration-key. Do not call authenticated CRM list endpoints with this key. Verify webhooks with header X-Meedo-Signature: sha256=<hex HMAC-SHA256 of the raw body>.

## Base URL and key

- Base URL: ${origin}
- Organization slug: the slug in the public URL, for example geoplan-philippines-inc
- Header: x-integration-key: $MEEDO_INTEGRATION_KEY
- The full key is shown once on create or rotate. Store it as MEEDO_INTEGRATION_KEY. Meedo stores only a SHA-256 hash and a display prefix.

The key can submit leads and subscribers only. It cannot read lists or change settings.

## Submit a lead

\`\`\`bash
curl -X POST "${origin}/api/v1/public/{orgSlug}/leads" \\
  -H "Content-Type: application/json" \\
  -H "x-integration-key: $MEEDO_INTEGRATION_KEY" \\
  -d '{"values":{"firstName":"Ada","lastName":"Lovelace","email":"ada@example.com","message":"Hello"}}'
\`\`\`

Response: 201 {"id":"<lead-id>"} inside the standard Meedo envelope.

## Submit a subscriber

\`\`\`bash
curl -X POST "${origin}/api/v1/public/{orgSlug}/subscribers" \\
  -H "Content-Type: application/json" \\
  -H "x-integration-key: $MEEDO_INTEGRATION_KEY" \\
  -d '{"values":{"email":"ada@example.com","name":"Ada Lovelace"}}'
\`\`\`

A new email subscribes. An already subscribed email is idempotent. An unsubscribed email is re-subscribed.

Optional top-level honeypot field: "honeypot". A non-empty value returns success and does not create a record.

## Webhooks

Events: lead.created, subscriber.created, subscriber.unsubscribed.

Sample payload:

\`\`\`json
{"id":"evt_123","type":"lead.created","createdAt":"2026-11-26T00:00:00.000Z","data":{"id":"lead_123","organizationId":"org_123"}}
\`\`\`

Signature header: X-Meedo-Signature: sha256=<hex HMAC-SHA256 of the raw body>.

Node.js check:

\`\`\`js
const crypto = require('crypto');
const expected = 'sha256=' + crypto.createHmac('sha256', process.env.MEEDO_WEBHOOK_SECRET).update(rawBody).digest('hex');
const ok = crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
\`\`\`
`;
}
