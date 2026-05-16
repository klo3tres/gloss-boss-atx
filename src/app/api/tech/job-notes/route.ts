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
      checklist?: unknown;
      beforeNotes?: string;
      afterNotes?: string;
      upsellSuggestions?: string;
      internalNotes?: string;
      damageNotes?: string;
      customerVisible?: boolean;
      appointmentId?: string;
      fallbackBookingId?: string;
    };

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
          .update({ assigned_technician_id: user.id, assigned_by: user.id, assigned_at: new Date().toISOString() })
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

    const checklist = Array.isArray(body.checklist) ? body.checklist.slice(0, 40) : [];
    const beforeNotes = String(body.beforeNotes ?? '').trim().slice(0, 8000);
    const afterNotes = String(body.afterNotes ?? '').trim().slice(0, 8000);
    const upsellSuggestions = String(body.upsellSuggestions ?? '').trim().slice(0, 8000);
    const internalNotes = String(body.internalNotes ?? '').trim().slice(0, 8000);
    const damageNotes = String(body.damageNotes ?? '').trim().slice(0, 8000);
    const customerVisible = Boolean(body.customerVisible);

    const insertPayload: Record<string, unknown> = {
      technician_id: user.id,
      checklist,
      before_notes: beforeNotes || null,
      after_notes: afterNotes || null,
      upsell_suggestions: upsellSuggestions || null,
      internal_notes: internalNotes || null,
      damage_notes: damageNotes || null,
      customer_visible: customerVisible,
    };
    if (appointmentId) insertPayload.appointment_id = appointmentId;
    if (fallbackBookingId) insertPayload.fallback_booking_id = fallbackBookingId;

    let { data, error } = await supabase.from('tech_job_notes').insert(insertPayload).select('id').maybeSingle();

    if (error && /internal_notes|damage_notes|customer_visible|column|schema cache|Could not find/i.test(error.message)) {
      const lean: Record<string, unknown> = {
        technician_id: user.id,
        checklist,
        before_notes: beforeNotes || null,
        after_notes: afterNotes || null,
        upsell_suggestions: upsellSuggestions || null,
      };
      if (appointmentId) lean.appointment_id = appointmentId;
      if (fallbackBookingId) lean.fallback_booking_id = fallbackBookingId;
      ({ data, error } = await supabase.from('tech_job_notes').insert(lean).select('id').maybeSingle());
    }

    if (error && isSchemaDriftError(error.message) && appointmentId) {
      const lean = {
        technician_id: user.id,
        checklist,
        before_notes: beforeNotes || null,
        after_notes: afterNotes || null,
        upsell_suggestions: upsellSuggestions || null,
      };
      ({ data, error } = await supabase.from('tech_job_notes').insert(lean).select('id').maybeSingle());
    }

    if (error) {
      console.warn('[tech/job-notes]', error.message);
      return NextResponse.json({ error: 'Could not save notes (table missing?). Run latest migrations.' }, { status: 503 });
    }

    if (appointmentId) {
      void recordJobTimelineEvent(supabase, {
        appointmentId,
        eventType: 'checklist_saved',
        meta: { field_notes_row: data?.id, checklist_items: checklist.length },
        createdBy: user.id,
      });
    }

    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e) {
    console.warn('[tech/job-notes]', e);
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
