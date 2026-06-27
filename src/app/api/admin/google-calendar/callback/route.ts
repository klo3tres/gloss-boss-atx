import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeGoogleOAuthCode } from '@/lib/google/google-calendar-sync';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code')?.trim();
  const state = url.searchParams.get('state')?.trim();
  const error = url.searchParams.get('error')?.trim();
  const setupBase = '/admin/setup-center?gcal=';

  if (error) {
    return NextResponse.redirect(`${setupBase}denied`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${setupBase}missing`);
  }

  const cookieStore = await cookies();
  const expected = cookieStore.get('gcal_oauth_state')?.value;
  if (!expected || expected !== state) {
    return NextResponse.redirect(`${setupBase}state`);
  }

  const tokens = await exchangeGoogleOAuthCode(code);
  if (!tokens) {
    return NextResponse.redirect(`${setupBase}token`);
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.redirect(`${setupBase}db`);
  }

  await admin.from('google_calendar_connections').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const { error: insErr } = await admin.from('google_calendar_connections').insert({
    google_account_email: tokens.email,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    token_expires_at: tokens.expiresAt,
    calendar_id: 'primary',
    sync_enabled: true,
    updated_at: new Date().toISOString(),
  });

  if (insErr) {
    console.error('[google-calendar/callback]', insErr.message);
    return NextResponse.redirect(`${setupBase}save`);
  }

  const res = NextResponse.redirect(`${setupBase}connected`);
  res.cookies.set('gcal_oauth_state', '', { maxAge: 0, path: '/' });
  return res;
}
