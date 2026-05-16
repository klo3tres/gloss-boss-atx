import { NextResponse } from 'next/server';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';
import { isSchemaDriftError } from '@/lib/booking-server-shared';
import { recordJobTimelineEvent } from '@/lib/job-timeline-server';
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

    const body = (await request.json()) as {
      checklist?: unknown;
      beforeNotes?: string;
      afterNotes?: string;
      upsellSuggestions?: string;
      internalNotes?: string;
      damageNotes?: string;
      customerVisible?: boolean;
      appointmentId?: string;
    };

    const appointmentId = String(body.appointmentId ?? '').trim();

    if (appointmentId) {
      const { data: appt, error: apErr } = await supabase
        .from('appointments')
        .select('id, assigned_technician_id')
        .eq('id', appointmentId)
        .maybeSingle();
      if (apErr || !appt || appt.assigned_technician_id !== user.id) {
        return NextResponse.json({ error: 'Invalid appointment for this technician' }, { status: 400 });
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
