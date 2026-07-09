import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { buildGoogleOAuthUrl } from '@/lib/google/google-calendar-sync';
import { googleCalendarOAuthConfigured, titanGoogleRedirectUri, titanGoogleOAuthConfigured } from '@/lib/google/google-calendar-config';
import { GLOSS_BOSS_BUSINESS_ID } from '@/lib/titan/business-context';

export const runtime = 'nodejs';

function safeReturnPath(raw: string | null | undefined) {
  const path = (raw ?? '').trim();
  if (path.startsWith('/titan') && !path.startsWith('//')) return path.split('?')[0] || '/titan/connect';
  return '/titan/connect';
}

export async function GET(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  if (!titanGoogleOAuthConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Google OAuth not configured — set GOOGLE_CALENDAR_CLIENT_ID/SECRET.' },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const returnTo = safeReturnPath(url.searchParams.get('return_to'));
  const businessId = url.searchParams.get('business_id')?.trim() || GLOSS_BOSS_BUSINESS_ID;
  const service = url.searchParams.get('service') === 'gmail' ? 'gmail' : 'calendar';

  const state = randomBytes(16).toString('hex');
  const extraScopes =
    service === 'gmail'
      ? ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly']
      : [];
  const oauthUrl = buildGoogleOAuthUrl(state, {
    redirectUri: titanGoogleRedirectUri(),
    extraScopes,
  });
  if (!oauthUrl) {
    return NextResponse.json({ ok: false, error: 'Could not build OAuth URL' }, { status: 500 });
  }

  const res = NextResponse.redirect(oauthUrl);
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 600,
    path: '/',
  };
  res.cookies.set('titan_oauth_state', state, cookieOpts);
  res.cookies.set('titan_oauth_return', returnTo, cookieOpts);
  res.cookies.set('titan_oauth_business_id', businessId, cookieOpts);
  res.cookies.set('titan_oauth_service', service, cookieOpts);
  return res;
}
