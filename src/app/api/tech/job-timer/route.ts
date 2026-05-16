import { NextResponse } from 'next/server';

import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';

import { isSchemaDriftError } from '@/lib/booking-server-shared';

import { recordJobTimelineEvent } from '@/lib/job-timeline-server';

import { tryCreateServerSupabase } from '@/lib/supabase/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';



export const runtime = 'nodejs';



function isFieldTechRole(role: string | null): boolean {

  return role === 'technician' || role === 'admin' || role === 'super_admin';

}



function resolveStartedAt(row: Record<string, unknown>): string | null {

  const started = row.started_at;

  if (typeof started === 'string' && started.trim()) return started;

  const created = row.created_at;

  if (typeof created === 'string' && created.trim()) return created;

  return null;

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



    const body = (await request.json()) as {
      action?: string;
      timerId?: string;
      label?: string;
      appointmentId?: string;
      fallbackBookingId?: string;
    };

    const action = String(body.action ?? '').trim();

    const nowIso = new Date().toISOString();

    const appointmentId = String(body.appointmentId ?? '').trim();
    const fallbackBookingId = String(body.fallbackBookingId ?? '').trim();
    const admin = tryCreateAdminSupabase();
    const db = admin ?? supabase;



    if (appointmentId) {

      const { data: appt, error: apErr } = await db

        .from('appointments')

        .select('id, assigned_technician_id, booking_source')

        .eq('id', appointmentId)

        .maybeSingle();

      const assigned = appt && typeof appt.assigned_technician_id === 'string' ? appt.assigned_technician_id : null;
      const isWalkIn = appt && String((appt as { booking_source?: string | null }).booking_source ?? '') === 'tech_workflow';
      if (!apErr && appt && assigned !== user.id && isWalkIn && !assigned && admin) {
        await admin
          .from('appointments')
          .update({ assigned_technician_id: user.id, assigned_by: user.id, assigned_at: nowIso, updated_at: nowIso })
          .eq('id', appointmentId);
      } else if (apErr || !appt || (assigned !== user.id && role !== 'admin' && role !== 'super_admin')) {

        return NextResponse.json({ error: 'Invalid appointment for this technician' }, { status: 400 });

      }

    }

    if (fallbackBookingId && admin) {
      const { data: fb, error: fbErr } = await admin
        .from('booking_fallbacks')
        .select('id, assigned_technician_id')
        .eq('id', fallbackBookingId)
        .maybeSingle();
      const assigned = fb && typeof fb.assigned_technician_id === 'string' ? fb.assigned_technician_id : null;
      if (fbErr || !fb || (assigned && assigned !== user.id && role !== 'admin' && role !== 'super_admin')) {
        return NextResponse.json({ error: 'Invalid fallback for this technician' }, { status: 400 });
      }
    }



    if (action === 'start') {

      const label = String(body.label ?? '').trim().slice(0, 200) || null;

      const insertPayload: Record<string, unknown> = { technician_id: user.id, label };

      if (appointmentId) insertPayload.appointment_id = appointmentId;
      if (fallbackBookingId) insertPayload.fallback_booking_id = fallbackBookingId;



      let { data, error } = await supabase

        .from('tech_job_timers')

        .insert(insertPayload)

        .select('id, started_at, created_at')

        .maybeSingle();



      if (error && isSchemaDriftError(error.message) && appointmentId) {

        const minimal: Record<string, unknown> = { technician_id: user.id, label };
        if (fallbackBookingId) minimal.fallback_booking_id = fallbackBookingId;

        ({ data, error } = await supabase.from('tech_job_timers').insert(minimal).select('id, started_at, created_at').maybeSingle());

      }



      if (error) {

        const minimal = await supabase.from('tech_job_timers').insert({ technician_id: user.id, label }).select('id').maybeSingle();

        if (minimal.error) {

          console.warn('[tech/job-timer]', minimal.error.message);

          return NextResponse.json({ error: 'Could not start timer (table missing?). Run latest migrations.' }, { status: 503 });

        }

        if (appointmentId) {

          void recordJobTimelineEvent(supabase, {

            appointmentId,

            eventType: 'timer_started',

            meta: { timer_id: minimal.data?.id, label },

            createdBy: user.id,

          });

        }

        return NextResponse.json({ ok: true, id: minimal.data?.id, startedAt: nowIso });

      }



      const row = (data ?? {}) as Record<string, unknown>;

      const startedAt = resolveStartedAt(row) ?? nowIso;



      if (appointmentId) {

        void recordJobTimelineEvent(supabase, {

          appointmentId,

          eventType: 'timer_started',

          meta: { timer_id: row.id, label },

          createdBy: user.id,

        });

      }



      return NextResponse.json({ ok: true, id: row.id, startedAt });

    }



    if (action === 'stop') {

      const id = String(body.timerId ?? '').trim();

      if (!id) {

        return NextResponse.json({ error: 'timerId required' }, { status: 400 });

      }



      let row: Record<string, unknown> | null = null;

      let gErr: { message: string } | null = null;



      const full = await supabase

        .from('tech_job_timers')

        .select('id, started_at, ended_at, created_at')

        .eq('id', id)

        .eq('technician_id', user.id)

        .maybeSingle();



      if (full.error) {

        gErr = full.error;

        const minimal = await supabase

          .from('tech_job_timers')

          .select('id, created_at, ended_at')

          .eq('id', id)

          .eq('technician_id', user.id)

          .maybeSingle();

        if (!minimal.error && minimal.data) {

          row = minimal.data as Record<string, unknown>;

        }

      } else {

        row = (full.data ?? null) as Record<string, unknown> | null;

      }



      if (!row) {

        return NextResponse.json({ error: gErr?.message ?? 'Timer not found' }, { status: 404 });

      }



      if (row.ended_at) {

        const dur =

          typeof row.duration_seconds === 'number' && !Number.isNaN(row.duration_seconds) ? row.duration_seconds : null;

        return NextResponse.json({ ok: true, alreadyStopped: true, durationSeconds: dur });

      }



      const startedAt = resolveStartedAt(row);

      if (!startedAt) {

        return NextResponse.json({ error: 'Timer has no start timestamp' }, { status: 400 });

      }



      const end = new Date();

      const start = new Date(startedAt);

      const durationSeconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));



      const updatePayload: Record<string, unknown> = {

        ended_at: end.toISOString(),

        duration_seconds: durationSeconds,

      };



      let uErr = (await supabase.from('tech_job_timers').update(updatePayload).eq('id', id).eq('technician_id', user.id)).error;



      if (uErr && /duration_seconds|started_at|column/i.test(uErr.message)) {

        uErr = (await supabase.from('tech_job_timers').update({ ended_at: end.toISOString() }).eq('id', id).eq('technician_id', user.id))

          .error;

      }



      if (uErr) {

        return NextResponse.json({ error: uErr.message }, { status: 500 });

      }



      if (appointmentId) {

        void recordJobTimelineEvent(supabase, {

          appointmentId,

          eventType: 'timer_stopped',

          meta: { timer_id: id, duration_seconds: durationSeconds },

          createdBy: user.id,

        });

      }



      return NextResponse.json({ ok: true, durationSeconds });

    }



    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (e) {

    console.warn('[tech/job-timer]', e);

    return NextResponse.json({ error: 'Request failed' }, { status: 500 });

  }

}

