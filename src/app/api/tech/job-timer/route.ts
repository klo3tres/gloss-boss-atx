import { NextResponse } from 'next/server';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';
import { tryCreateServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function isFieldTechRole(role: string | null): boolean {
  return role === 'technician' || role === 'admin' || role === 'super_admin';
}

export async function POST(request: Request) {
  try {
    const supabase = await tryCreateServerSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Server session unavailable' }, { status: 503 });
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    let role = parseAppRole(profile?.role);
    if (!profile?.role) {
      const em = (user.email ?? '').trim().toLowerCase();
      if (em === OWNER_LOGIN_EMAIL) role = 'super_admin';
    }
    if (!isFieldTechRole(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as { action?: string; timerId?: string; label?: string };
    const action = String(body.action ?? '').trim();

    if (action === 'start') {
      const label = String(body.label ?? '').trim().slice(0, 200) || null;
      const { data, error } = await supabase
        .from('tech_job_timers')
        .insert({ technician_id: user.id, label })
        .select('id, started_at')
        .maybeSingle();
      if (error) {
        console.warn('[tech/job-timer]', error.message);
        return NextResponse.json({ error: 'Could not start timer (table missing?). Run latest migrations.' }, { status: 503 });
      }
      return NextResponse.json({ ok: true, id: data?.id, startedAt: data?.started_at });
    }

    if (action === 'stop') {
      const id = String(body.timerId ?? '').trim();
      if (!id) {
        return NextResponse.json({ error: 'timerId required' }, { status: 400 });
      }
      const { data: row, error: gErr } = await supabase
        .from('tech_job_timers')
        .select('id, started_at, ended_at')
        .eq('id', id)
        .eq('technician_id', user.id)
        .maybeSingle();
      if (gErr || !row?.started_at) {
        return NextResponse.json({ error: 'Timer not found' }, { status: 404 });
      }
      if (row.ended_at) {
        return NextResponse.json({ ok: true, alreadyStopped: true, durationSeconds: null });
      }
      const end = new Date();
      const start = new Date(row.started_at);
      const durationSeconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
      const { error: uErr } = await supabase
        .from('tech_job_timers')
        .update({ ended_at: end.toISOString(), duration_seconds: durationSeconds })
        .eq('id', id)
        .eq('technician_id', user.id);
      if (uErr) {
        return NextResponse.json({ error: uErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, durationSeconds });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    console.warn('[tech/job-timer]', e);
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
