import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { buildGoogleOAuthUrl } from '@/lib/google/google-calendar-sync';
import { googleCalendarOAuthConfigured } from '@/lib/google/google-calendar-config';
import { randomBytes } from 'node:crypto';

export const runtime = 'nodejs';

function safeAdminReturnPath(raw: string | null): string {
  const path = (raw ?? '').trim();
  if (path.startsWith('/admin') && !path.startsWith('//')) return path.split('?')[0] || '/admin/setup-center';
  return '/admin/setup-center';
}

export async function GET(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }
  if (!googleCalendarOAuthConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Set GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, and GOOGLE_CALENDAR_REDIRECT_URI in Vercel.',
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const returnTo = safeAdminReturnPath(url.searchParams.get('return_to'));

  const state = randomBytes(16).toString('hex');
  const oauthUrl = buildGoogleOAuthUrl(state);
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
  res.cookies.set('gcal_oauth_state', state, cookieOpts);
  res.cookies.set('gcal_oauth_return', returnTo, cookieOpts);
  return res;
}
