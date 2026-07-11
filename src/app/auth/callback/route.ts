import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getPublicSupabaseEnv } from '@/lib/supabase/env';

export const runtime = 'nodejs';

/**
 * Supabase auth callback — exchanges PKCE / recovery codes for a session cookie.
 * Recovery and magic links should redirect here, then onward to /reset-password or post-login.
 */
export async function GET(request: Request) {
  const env = getPublicSupabaseEnv();
  if (!env) {
    return NextResponse.redirect(new URL('/login?error=auth_not_configured', request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/reset-password';
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_auth_code', request.url));
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          /* ignore read-only cookie context */
        }
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, origin),
    );
  }

  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/reset-password';
  return NextResponse.redirect(new URL(safeNext, origin));
}
