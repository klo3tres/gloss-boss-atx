# Gloss Boss ATX Supabase Auth Email Templates

Use these files in Supabase Dashboard > Authentication > Email Templates.

- Confirm signup subject: `Gloss Boss ATX — Confirm Your Account`
- Reset password subject: `Gloss Boss ATX — Reset Your Password`
- Magic link subject: `Gloss Boss ATX — Your Secure Sign-In Link`

Redirect configuration:

- Set `NEXT_PUBLIC_APP_URL` in Vercel to the production URL.
- In Supabase Auth URL Configuration, set Site URL to the same production URL.
- Add production redirect URLs for `/login`, `/dashboard`, `/customer`, and `/reset-password`.
- Remove localhost redirect URLs from production Supabase settings.

Paste the HTML from:

- `confirm-signup.html`
- `reset-password.html`
- `magic-link.html`

Each template uses Supabase's `{{ .ConfirmationURL }}` variable for the secure action link.
