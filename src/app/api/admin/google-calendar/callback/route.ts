import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  exchangeGoogleOAuthCode,
  type GoogleOAuthExchangeResult,
} from '@/lib/google/google-calendar-sync';
import {
  type GoogleCalendarOAuthErrorCode,
  mapGoogleTokenError,
} from '@/lib/google/google-calendar-oauth-errors';
import {
  googleCalendarClientId,
  googleCalendarClientSecret,
  googleCalendarOAuthConfigured,
} from '@/lib/google/google-calendar-config';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

function redirectSetup(request: Request, params: Record<string, string>) {
  const url = new URL('/admin/setup-center', request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

function redirectCalendarError(request: Request, code: GoogleCalendarOAuthErrorCode, logDetail?: string) {
  if (logDetail) {
    console.error('[google-calendar/callback]', code, logDetail.slice(0, 500));
  } else {
    console.error('[google-calendar/callback]', code);
  }
  return redirectSetup(request, { calendar_error: code });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code')?.trim();
    const state = url.searchParams.get('state')?.trim();
    const googleError = url.searchParams.get('error')?.trim();
    const googleErrorDesc = url.searchParams.get('error_description')?.trim();

    if (googleError) {
      const codeKey: GoogleCalendarOAuthErrorCode =
        googleError === 'access_denied' ? 'access_denied' : mapGoogleTokenError(googleErrorDesc ?? googleError);
      return redirectCalendarError(request, codeKey, googleErrorDesc ?? googleError);
    }

    if (!googleCalendarClientId()) {
      return redirectCalendarError(request, 'missing_client_id');
    }
    if (!googleCalendarClientSecret()) {
      return redirectCalendarError(request, 'missing_client_secret');
    }
    if (!googleCalendarOAuthConfigured()) {
      return redirectCalendarError(request, 'missing_client_id', 'GOOGLE_CALENDAR_REDIRECT_URI missing');
    }

    if (!code || !state) {
      return redirectCalendarError(request, 'oauth_missing_code');
    }

    const cookieStore = await cookies();
    const expected = cookieStore.get('gcal_oauth_state')?.value;
    if (!expected || expected !== state) {
      return redirectCalendarError(request, 'oauth_state_mismatch');
    }

    const gate = await requireAdminApiUser();
    if (!gate.ok) {
      return redirectCalendarError(request, 'no_authenticated_admin', gate.error);
    }

    const exchange: GoogleOAuthExchangeResult = await exchangeGoogleOAuthCode(code);
    if (!exchange.ok) {
      return redirectCalendarError(request, exchange.code, exchange.detail);
    }

    const admin = tryCreateAdminSupabase();
    if (!admin) {
      return redirectCalendarError(request, 'service_role_unavailable');
    }

    const { error: delErr } = await admin
      .from('google_calendar_connections')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (delErr) {
      const missingTable = /google_calendar_connections|schema cache|does not exist/i.test(delErr.message);
      return redirectCalendarError(
        request,
        'database_write_failed',
        missingTable ? `${delErr.message} — apply migration 000105` : delErr.message,
      );
    }

    const now = new Date().toISOString();
    const { error: insErr } = await admin.from('google_calendar_connections').insert({
      google_account_email: exchange.tokens.email,
      access_token: exchange.tokens.accessToken,
      refresh_token: exchange.tokens.refreshToken,
      token_expires_at: exchange.tokens.expiresAt,
      calendar_id: 'primary',
      sync_enabled: true,
      last_error: null,
      updated_at: now,
    });

    if (insErr) {
      return redirectCalendarError(request, 'database_write_failed', insErr.message);
    }

    const res = redirectSetup(request, { gcal: 'connected' });
    res.cookies.set('gcal_oauth_state', '', { maxAge: 0, path: '/' });
    return res;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[google-calendar/callback] unhandled', detail);
    return redirectCalendarError(request, 'unknown_calendar_error', detail);
  }
}
