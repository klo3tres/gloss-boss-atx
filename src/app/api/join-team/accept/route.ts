import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getPublicSupabaseEnv } from '@/lib/supabase/env';
import { acceptStaffInvite } from '@/lib/staff-invites';
import { logAuthEvent } from '@/lib/auth/auth-event-log';

export const runtime = 'nodejs';

type Body = {
  token: string;
  mode: 'create' | 'link';
  fullName?: string;
  email?: string;
  phone?: string;
  password?: string;
};

export async function POST(request: Request) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, error: 'Service unavailable.' }, { status: 503 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const token = String(body.token ?? '').trim();
  if (!token) return NextResponse.json({ ok: false, error: 'Missing token.' }, { status: 400 });

  let authUserId: string | undefined;
  if (body.mode === 'link') {
    const env = getPublicSupabaseEnv();
    if (!env) return NextResponse.json({ ok: false, error: 'Auth not configured.' }, { status: 503 });
    const cookieStore = await cookies();
    const supabase = createServerClient(env.url, env.anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            /* read-only */
          }
        },
      },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: 'Sign in first, then complete setup.' }, { status: 401 });
    }
    authUserId = user.id;
  }

  const result = await acceptStaffInvite(admin, token, {
    mode: body.mode,
    authUserId,
    fullName: String(body.fullName ?? '').trim(),
    email: String(body.email ?? '').trim().toLowerCase(),
    phone: body.phone ? String(body.phone).trim() : undefined,
    password: body.password ? String(body.password) : undefined,
  });

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });

  await logAuthEvent(admin, {
    eventType: 'invite_accepted',
    subjectUserId: result.authUserId ?? null,
    subjectEmail: String(body.email ?? '').trim().toLowerCase() || null,
    detail: `mode=${body.mode}`,
    meta: { redirect: result.redirect },
  });

  return NextResponse.json({ ok: true, redirect: result.redirect, authUserId: result.authUserId });
}
