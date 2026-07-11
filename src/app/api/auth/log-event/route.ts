import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type AuthEventType, logAuthEvent } from '@/lib/auth/auth-event-log';
import { getPublicSupabaseEnv } from '@/lib/supabase/env';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

const ALLOWED: AuthEventType[] = [
  'password_updated',
  'reset_opened',
  'confirmation_requested',
  'confirmation_sent',
  'confirmation_failed',
  'invite_opened',
  'login_failed',
  'profile_resolution_succeeded',
  'profile_resolution_failed',
  'role_resolved',
];

export async function POST(request: Request) {
  const env = getPublicSupabaseEnv();
  if (!env) return NextResponse.json({ ok: false }, { status: 503 });

  let body: { eventType?: string; detail?: string; meta?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = body.eventType as AuthEventType | undefined;
  if (!eventType || !ALLOWED.includes(eventType)) {
    return NextResponse.json({ ok: false, error: 'Unsupported event' }, { status: 400 });
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ ok: true, skipped: true });

  await logAuthEvent(admin, {
    eventType,
    actorUserId: user?.id ?? null,
    subjectUserId: user?.id ?? null,
    subjectEmail: user?.email ?? null,
    detail: body.detail ?? null,
    meta: body.meta ?? {},
  });

  return NextResponse.json({ ok: true });
}
