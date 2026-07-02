import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { claimPortalAppointmentForUser } from '@/lib/customer-portal-access';
import { getPublicSupabaseEnv } from '@/lib/supabase/env';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export async function POST(request: Request) {
  const env = getPublicSupabaseEnv();
  if (!env) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as {
    appointment_id?: string;
    token?: string;
  };
  const appointmentId = String(body.appointment_id ?? '').trim();
  const token = String(body.token ?? '').trim();
  if (!appointmentId || !token) return NextResponse.json({ error: 'Missing appointment_id or token' }, { status: 400 });

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
          /* ignore */
        }
      },
    },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user?.id || !user.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  const claim = await claimPortalAppointmentForUser(admin, {
    appointmentId,
    token,
    authUserId: user.id,
    email: user.email,
    fullName: typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null,
  });

  if (!claim.ok) return NextResponse.json({ error: claim.error ?? 'Claim failed' }, { status: 400 });
  return NextResponse.json({ ok: true, dashboardUrl: claim.dashboardUrl, customerId: claim.customerId });
}
