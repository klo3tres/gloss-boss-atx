# Gloss Boss ATX Supabase Auth Email Templates

Use these files in **Supabase Dashboard → Authentication → Email Templates**.

Logo (must be publicly reachable):

`https://glossbossatx.com/branding/gloss-boss-atx-logo.png`

Local file: `public/branding/gloss-boss-atx-logo.png`

## Recommended subject lines

| Template | Subject |
|----------|---------|
| Confirm signup | `Gloss Boss ATX \| Confirm Your Email` |
| Invite user | `Gloss Boss ATX \| You're Invited` |
| Magic link / OTP | `Gloss Boss ATX \| Secure Sign In` |
| Change email | `Gloss Boss ATX \| Confirm Email Change` |
| Reset password | `Gloss Boss ATX \| Reset Your Password` |
| Reauthentication | `Gloss Boss ATX \| Verify Your Identity` |

## Paste HTML from

- `confirm-signup.html`
- `invite-user.html`
- `magic-link.html`
- `change-email.html`
- `reset-password.html`
- `reauthentication.html`

Transactional (Resend app, not Supabase Auth):

- `appointment-receipt.html`
- `welcome-email.html`
- `job-complete.html`
- `review-request.html`

Each auth template includes:

- Gloss Boss ATX logo image
- Black/gold luxury styling
- Polished CTA button
- `{{ .ConfirmationURL }}` (or Supabase OTP variables where applicable)
- Support: [info@glossbossatx.com](mailto:info@glossbossatx.com)

## Redirect configuration

- Set `NEXT_PUBLIC_APP_URL` in Vercel to the production URL.
- In Supabase Auth URL Configuration, set Site URL to the same production URL.
- Add production redirect URLs for `/login`, `/dashboard`, `/customer`, and `/reset-password`.
- Remove localhost redirect URLs from production Supabase settings.

Mirrored copies for reference also live under `supabase/email-templates/`.
