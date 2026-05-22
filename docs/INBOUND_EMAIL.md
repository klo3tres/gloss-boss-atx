# Inbound email: info@glossbossatx.com → Gmail + CRM

## What the app does

When mail arrives at **info@glossbossatx.com** through [Resend Inbound](https://resend.com/docs/dashboard/receiving/introduction):

1. Resend sends a webhook to `POST /api/webhooks/resend-inbound`
2. The app loads the full message body from Resend’s Receiving API
3. A row is inserted into **`messages`** (Admin → Message center) with `source: inbound_email`
4. A copy is forwarded to **glossbossatx1@gmail.com** (or `INBOUND_FORWARD_TO`) via Resend outbound

Website contact form messages still use the same CRM table and the same forward address via `CONTACT_NOTIFY_EMAIL`.

## Resend setup (required)

1. **Domain** — In Resend, enable **Receiving** for `glossbossatx.com` and add the MX records Resend provides (replace or prioritize over other MX if you want all `@glossbossatx.com` mail in Resend).
2. **Address** — Ensure `info@glossbossatx.com` is routed to your inbound domain (catch-all or explicit alias per Resend docs).
3. **Webhook** — Resend → Webhooks → Add endpoint:
   - URL: `https://<your-production-domain>/api/webhooks/resend-inbound`
   - Event: **`email.received`**
   - Copy the **signing secret** into `RESEND_WEBHOOK_SECRET`

## Environment variables

```env
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=info@glossbossatx.com   # verified sender for forwards
RESEND_WEBHOOK_SECRET=whsec_...           # from Resend webhook settings

# Optional overrides (defaults shown)
INBOUND_MAILBOX_EMAIL=info@glossbossatx.com
INBOUND_FORWARD_TO=glossbossatx1@gmail.com
CONTACT_NOTIFY_EMAIL=glossbossatx1@gmail.com
```

## Database

Apply migration `000051_inbound_email_crm.sql` for `inbound_email_id` dedupe and `source` on `messages`.

## Verify

1. `GET https://your-domain/api/webhooks/resend-inbound` — should return mailbox + forward addresses.
2. Send a test email to **info@glossbossatx.com** from an external account.
3. Check **glossbossatx1@gmail.com** for `[Inbox info@glossbossatx.com] …` subject.
4. Check **Admin → Message center** for a new message with status `new`.

## Note on Google Workspace / other MX

If **info@** is still on Google Workspace with its own inbox, you can either:

- Point MX to Resend for CRM + forward (this app), or
- Keep Google forwarding to Gmail manually **and** BCC a Resend inbound address — but the supported path for CRM + forward in one flow is **Resend inbound + this webhook**.
