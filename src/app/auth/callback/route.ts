import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getPublicSupabaseEnv } from '@/lib/supabase/env';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveDashboardPathForRole } from '@/lib/auth/resolve-post-login-path';
import { parseAppRole } from '@/lib/auth/role-resolution';
import { logAuthEvent } from '@/lib/auth/auth-event-log';

export const runtime = 'nodejs';

/**
 * Supabase auth callback — exchanges PKCE / OTP codes, then routes by auth event type.
 * Never dump every auth event onto the generic login page.
 */
export async function GET(request: Request) {
  const env = getPublicSupabaseEnv();
  if (!env) {
    return NextResponse.redirect(new URL('/login?error=auth_not_configured', request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const typeParam = (url.searchParams.get('type') || '').toLowerCase();
  const nextParam = url.searchParams.get('next');
  const errorDesc = url.searchParams.get('error_description') || url.searchParams.get('error');
  const origin = url.origin;

  if (errorDesc) {
    const lower = errorDesc.toLowerCase();
    const dest = lower.includes('expir')
      ? '/forgot-password?error=expired'
      : `/login?error=${encodeURIComponent('This sign-in link could not be used. Request a new one.')}`;
    return NextResponse.redirect(new URL(dest, origin));
  }

  if (!code && !tokenHash) {
    return NextResponse.redirect(new URL('/login?error=missing_auth_code&notice=Open the link from your email again.', request.url));
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
          /* ignore */
        }
      },
    },
  });

  let exchangeError: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) exchangeError = error.message;
  } else if (tokenHash && typeParam) {
    const otpType = typeParam as 'recovery' | 'signup' | 'invite' | 'magiclink' | 'email';
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType === 'invite' ? 'invite' : otpType === 'recovery' ? 'recovery' : otpType === 'signup' ? 'signup' : 'email',
    });
    if (error) exchangeError = error.message;
  }

  if (exchangeError) {
    const lower = exchangeError.toLowerCase();
    const dest = lower.includes('expir') || lower.includes('otp')
      ? typeParam === 'recovery'
        ? '/forgot-password?error=expired'
        : '/login?error=link_expired'
      : `/login?error=${encodeURIComponent('We could not complete sign-in from that link. Request a new one.')}`;
    return NextResponse.redirect(new URL(dest, origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = tryCreateAdminSupabase();
  if (admin && user) {
    await logAuthEvent(admin, {
      eventType: typeParam === 'recovery' ? 'reset_opened' : typeParam === 'signup' ? 'email_confirmed' : 'login_succeeded',
      subjectUserId: user.id,
      subjectEmail: user.email,
      detail: `auth_callback type=${typeParam || 'code'}`,
    });
  }

  // Explicit next wins when safe
  if (nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')) {
    if (typeParam === 'recovery' || nextParam.includes('reset-password')) {
      return NextResponse.redirect(new URL('/reset-password', origin));
    }
    return NextResponse.redirect(new URL(nextParam, origin));
  }

  // Route by auth type
  if (typeParam === 'recovery') {
    return NextResponse.redirect(new URL('/reset-password', origin));
  }
  if (typeParam === 'invite') {
    return NextResponse.redirect(new URL('/join-team?notice=complete_setup', origin));
  }
  if (typeParam === 'signup' || typeParam === 'email') {
    // Resolve role for portal
    if (admin && user) {
      const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
      const role = parseAppRole((profile as { role?: string } | null)?.role) ?? 'customer';
      const dest = resolveDashboardPathForRole(role, null, user.email);
      return NextResponse.redirect(new URL(dest, origin));
    }
    return NextResponse.redirect(new URL('/dashboard', origin));
  }

  // Default: post-login portal by role
  if (admin && user) {
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const role = parseAppRole((profile as { role?: string } | null)?.role);
    if (role) {
      return NextResponse.redirect(new URL(resolveDashboardPathForRole(role, null, user.email), origin));
    }
  }

  return NextResponse.redirect(new URL('/login?notice=signed_in', origin));
}
