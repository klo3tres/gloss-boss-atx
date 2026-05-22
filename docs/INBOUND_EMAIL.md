# Resend email: inbound + outbound webhooks

## One webhook URL (required)

Configure **exactly one** webhook in the [Resend dashboard](https://resend.com/webhooks):

```
https://glossbossatx.com/api/resend/webhook
```

(Use your production `NEXT_PUBLIC_APP_URL` + `/api/resend/webhook` in other environments.)

### Enable these events

- `email.sent`
- `email.delivered`
- `email.bounced`
- `email.failed`
- `email.received`
- `email.opened` (optional)
- `email.clicked` (optional)

### Signing secret

Copy the webhook signing secret into:

```env
RESEND_WEBHOOK_SECRET=whsec_...
```

## What happens per event

### `email.received` (inbound to info@glossbossatx.com)

1. Webhook metadata arrives (body is fetched via Resend Receiving API).
2. Row saved to **`messages`** with `source: inbound_email`, `status: new`, `direction: inbound`, plus from/to/subject/body and `raw_payload`.
3. Dedupe by Resend receiving `email_id` and Svix event id (`resend_webhook_event_id`).
4. Copy forwarded to **`INBOUND_FORWARD_TO`** (default `glossbossatx1@gmail.com`) with **Reply-To** = original sender.

### Outbound events (`email.sent`, `email.delivered`, etc.)

- Updates **`notification_outbox`** rows matched by `provider_message_id` (Resend email id).
- Updates recent **`integration_test_events`** for Admin “Send test email” when applicable.
- Logs audit rows under `resend_webhook_outbound` / `resend_inbound_received`.

## Environment

```env
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=info@glossbossatx.com
RESEND_WEBHOOK_SECRET=whsec_...

INBOUND_MAILBOX_EMAIL=info@glossbossatx.com
INBOUND_FORWARD_TO=glossbossatx1@gmail.com
CONTACT_NOTIFY_EMAIL=glossbossatx1@gmail.com
```

## Resend receiving (MX)

Inbound mail must reach Resend: enable **Receiving** on `glossbossatx.com` and add Resend MX records. See [Resend receiving docs](https://resend.com/docs/dashboard/receiving/introduction).

## Database

Apply migrations:

- `000051_inbound_email_crm.sql`
- `000052_resend_webhook_messages.sql`

## Verify

1. `GET https://glossbossatx.com/api/resend/webhook` — shows canonical URL and required events.
2. Admin → **Integrations** — Resend Webhook card shows one URL and last inbound/outbound activity.
3. Email **info@glossbossatx.com** → Message center + Gmail forward.
4. Admin “Send test email” → webhook updates status when `email.delivered` fires.

## Legacy endpoint (do not configure)

`/api/webhooks/resend-inbound` is **deprecated**. `GET` returns `410`. `POST` still works temporarily but logs a warning — remove this URL from Resend if it was added earlier.
