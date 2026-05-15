# Gloss Boss ATX

Luxury detailing marketing site and CRM (Next.js App Router, Supabase, Stripe).

## Run the site on your machine

1. **Open this folder in Cursor** (not an empty parent folder). The app root must contain `package.json` and `src/`.

   Default path when this repo lives in a Cursor project:

   `C:\Users\hawth\.cursor\projects\c-Users-hawth-OneDrive-Documents\gloss-boss-atx`

2. Install dependencies (once):

   ```bash
   npm install
   ```

3. Start the dev server (always **port 3000** so your browser URL matches the running app):

   ```bash
   npm run dev
   ```

4. Open **http://localhost:3000**. The dev server is fixed to port **3000** only—if it is already in use, stop the other process (or change the port in `package.json` locally).

### Dev stability (clean `.next`)

If the UI looks unstyled, pages go blank after edits, or you see webpack runtime errors about missing factories, **stop the dev server**, wipe the Next cache, and start clean (same as `rm -rf .next` then `next dev -p 3000`, but works on Windows):

```bash
npm run dev:clean
```

That deletes `.next` then runs `next dev -p 3000`. After pulling changes, do a **hard refresh** in the browser (Ctrl+Shift+R).

In **development**, open the browser console and filter for **`[STABILITY_DEBUG]`** (stylesheet counts, `/_next/` HEAD 404s, href list) and **`[STABILITY_DEBUG_RUNTIME]`** (window errors, chunk/module failures, hydration-related console output, render errors from `SafeRenderBoundary`).

If you open `/admin`, `/customer`, or `/tech` **before** env vars exist, you will be redirected to **`/setup`** with instructions instead of a Supabase crash.

The public homepage and most marketing pages work **without** Supabase. Booking, login, and dashboards need environment variables (copy `.env.local.example` or `env.local.example` to `.env.local`).

### Database migrations

Run in Supabase SQL editor (in order):

1. `supabase/migrations/000001_init_crm.sql`
2. `supabase/migrations/000002_cms_job_times_signature.sql` (CMS tables, job timestamps, signature-before-complete rule)
3. `supabase/migrations/000003_settings.sql`
4. `supabase/migrations/000004_gallery_featured_seed.sql`
5. **`supabase/migrations/000005_profiles_rls_bypass_helpers.sql`** — optional if you already merged helpers; otherwise skip if you apply **000006** (includes the same `ALTER FUNCTION … row_security = off` lines).
6. **`supabase/migrations/000006_profiles_simple_rls.sql`** — **recommended for production login issues**: replaces `profiles` RLS with self-only policies (no `is_staff()` in `profiles` policies) and keeps role helper functions safe for other tables.

### Roles (RBAC)

Roles live on **`public.profiles.role`** (`super_admin`, `admin`, `technician`, `customer`) — not a separate `user_roles` table. After your owner account exists:

```sql
update public.profiles set role = 'super_admin' where id = 'YOUR_AUTH_USER_UUID';
```

## Production preview locally

```bash
npm run build
npm run start
```

Then open **http://localhost:3000**
