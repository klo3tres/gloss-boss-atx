import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export async function POST(req: Request) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !admin || !isStaffRole(session.profile?.role ?? null)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const body = (await req.json()) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    userAgent?: string;
  };

  const endpoint = str(body.endpoint);
  const p256dh = str(body.keys?.p256dh);
  const auth = str(body.keys?.auth);
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }

  const { error } = await admin.from('push_subscriptions').upsert(
    {
      user_id: session.user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: str(body.userAgent) || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,endpoint' },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !admin || !isStaffRole(session.profile?.role ?? null)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const body = (await req.json()) as { endpoint?: string };
  const endpoint = str(body.endpoint);
  if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });

  await admin.from('push_subscriptions').delete().eq('user_id', session.user.id).eq('endpoint', endpoint);
  return NextResponse.json({ ok: true });
}
