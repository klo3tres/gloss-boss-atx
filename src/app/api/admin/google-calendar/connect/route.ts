import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { buildGoogleOAuthUrl } from '@/lib/google/google-calendar-sync';
import { googleCalendarOAuthConfigured } from '@/lib/google/google-calendar-config';
import { randomBytes } from 'node:crypto';

export const runtime = 'nodejs';

export async function GET() {
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

  const state = randomBytes(16).toString('hex');
  const url = buildGoogleOAuthUrl(state);
  if (!url) {
    return NextResponse.json({ ok: false, error: 'Could not build OAuth URL' }, { status: 500 });
  }

  const res = NextResponse.redirect(url);
  res.cookies.set('gcal_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return res;
}
