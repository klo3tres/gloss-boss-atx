# Resend webhook (canonical)

**Endpoint:** `POST /api/resend/webhook`

**Production URL:** `https://glossbossatx.com/api/resend/webhook`

See [INBOUND_EMAIL.md](./INBOUND_EMAIL.md) for full setup (inbound CRM + Gmail forward + outbound status updates).

**Do not** add a second webhook pointing at `/api/webhooks/resend-inbound`.
