/**
 * Central Supabase environment reads + logging.
 * Never pass empty strings into createClient — it throws at runtime.
 */

export type PublicSupabaseEnv = {
  url: string;
  anonKey: string;
};

export function getPublicSupabaseEnv(): PublicSupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getPublicSupabaseEnv() !== null;
}

let missingPublicSupabaseLogged = false;

export function logMissingPublicSupabaseEnv(context: string): void {
  if (missingPublicSupabaseLogged) return;
  missingPublicSupabaseLogged = true;
  console.error(
    `[Gloss Boss ATX] Missing or empty NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY (first check: ${context}).\n` +
      '  → Copy .env.example to .env.local in the project root.\n' +
      '  → Supabase Dashboard → Project Settings → API → Project URL + anon public key.'
  );
}

export function getServiceRoleEnv(): { url: string; serviceRoleKey: string } | null {
  const pub = getPublicSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!pub || !serviceRoleKey) return null;
  return { url: pub.url, serviceRoleKey };
}

let missingServiceRoleLogged = false;

export function logMissingServiceRoleEnv(context: string): void {
  if (missingServiceRoleLogged) return;
  missingServiceRoleLogged = true;
  console.error(
    `[Gloss Boss ATX] Missing SUPABASE_SERVICE_ROLE_KEY (server-only; first check: ${context}).\n` +
      '  → Add it to .env.local (never commit). Required for bookings, webhooks, and contact form writes.'
  );
}
