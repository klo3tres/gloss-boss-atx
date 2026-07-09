import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  exchangeGoogleOAuthCode,
  type GoogleOAuthExchangeResult,
} from '@/lib/google/google-calendar-sync';
import { mapGoogleTokenError, type GoogleCalendarOAuthErrorCode } from '@/lib/google/google-calendar-oauth-errors';
import { googleCalendarOAuthConfigured, titanGoogleRedirectUri } from '@/lib/google/google-calendar-config';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { upsertBusinessIntegration } from '@/lib/titan/integrations';
import { GLOSS_BOSS_BUSINESS_ID } from '@/lib/titan/business-context';

export const runtime = 'nodejs';

function safeReturnPath(raw: string | null | undefined) {
  const path = (raw ?? '').trim();
  if (path.startsWith('/titan') && !path.startsWith('//')) return path.split('?')[0] || '/titan/connect';
  return '/titan/connect';
}

function redirectTitan(request: Request, params: Record<string, string>, returnPath?: string) {
  const url = new URL(returnPath ?? '/titan/connect', request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code')?.trim();
    const state = url.searchParams.get('state')?.trim();
    const googleError = url.searchParams.get('error')?.trim();

    if (googleError) {
      return redirectTitan(request, { integration_error: googleError });
    }

    if (!googleCalendarOAuthConfigured() || !code || !state) {
      return redirectTitan(request, { integration_error: 'oauth_missing_code' });
    }

    const cookieStore = await cookies();
    const expected = cookieStore.get('titan_oauth_state')?.value;
    const returnTo = safeReturnPath(cookieStore.get('titan_oauth_return')?.value);
    const businessId = cookieStore.get('titan_oauth_business_id')?.value || GLOSS_BOSS_BUSINESS_ID;
    const service = cookieStore.get('titan_oauth_service')?.value === 'gmail' ? 'gmail' : 'google_calendar';

    if (!expected || expected !== state) {
      return redirectTitan(request, { integration_error: 'oauth_state_mismatch' }, returnTo);
    }

    const gate = await requireAdminApiUser();
    if (!gate.ok) {
      return redirectTitan(request, { integration_error: 'no_authenticated_user' }, returnTo);
    }

    const exchange: GoogleOAuthExchangeResult = await exchangeGoogleOAuthCode(code, titanGoogleRedirectUri());
    if (!exchange.ok) {
      return redirectTitan(request, { integration_error: exchange.code }, returnTo);
    }

    const admin = tryCreateAdminSupabase();
    if (!admin) {
      return redirectTitan(request, { integration_error: 'service_role_unavailable' }, returnTo);
    }

    const now = new Date().toISOString();
    const integrationType = service === 'gmail' ? 'gmail' : 'google_calendar';

    await upsertBusinessIntegration(admin, {
      businessId,
      userId: gate.userId,
      integrationType,
      status: 'connected',
      connectedAccount: exchange.tokens.email,
      accessToken: exchange.tokens.accessToken,
      refreshToken: exchange.tokens.refreshToken,
      tokenExpiresAt: exchange.tokens.expiresAt,
      scopes: service === 'gmail' ? ['gmail.send', 'gmail.readonly'] : ['calendar.events'],
      metadata: { calendar_id: 'primary' },
    });

    if (integrationType === 'google_calendar') {
      await admin.from('google_calendar_connections').delete().eq('business_id', businessId);
      await admin.from('google_calendar_connections').insert({
        business_id: businessId,
        user_id: gate.userId,
        google_account_email: exchange.tokens.email,
        access_token: exchange.tokens.accessToken,
        refresh_token: exchange.tokens.refreshToken,
        token_expires_at: exchange.tokens.expiresAt,
        calendar_id: 'primary',
        sync_enabled: true,
        last_error: null,
        updated_at: now,
      });
    }

    const res = redirectTitan(request, { integration: 'connected' }, returnTo);
    res.cookies.set('titan_oauth_state', '', { maxAge: 0, path: '/' });
    res.cookies.set('titan_oauth_return', '', { maxAge: 0, path: '/' });
    res.cookies.set('titan_oauth_business_id', '', { maxAge: 0, path: '/' });
    res.cookies.set('titan_oauth_service', '', { maxAge: 0, path: '/' });
    return res;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[titan/google/callback]', detail);
    return redirectTitan(request, { integration_error: 'unknown' });
  }
}
