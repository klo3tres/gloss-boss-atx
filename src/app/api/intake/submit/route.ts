import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      appointmentId?: string;
      token?: string;
      sessionId?: string | null;
      formData?: Record<string, unknown>;
    };

    const appointmentId = String(body.appointmentId ?? '').trim();
    const token = String(body.token ?? '').trim();
    const formData = body.formData && typeof body.formData === 'object' ? body.formData : {};

    if (!appointmentId || !token) {
      return NextResponse.json({ ok: false, error: 'Missing parameters' }, { status: 400 });
    }

    const admin = tryCreateAdminSupabase();
    if (!admin) {
      return NextResponse.json({ ok: false, error: 'Server unavailable' }, { status: 503 });
    }

    const { data: appt, error: apptErr } = await admin
      .from('appointments')
      .select('id, access_token, status')
      .eq('id', appointmentId)
      .maybeSingle();

    if (apptErr || !appt || appt.access_token !== token) {
      return NextResponse.json({ ok: false, error: 'Invalid booking link' }, { status: 403 });
    }

    const { error: insErr } = await admin.from('intake_submissions').upsert(
      {
        appointment_id: appointmentId,
        form_data: formData,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'appointment_id' },
    );

    if (insErr) {
      console.warn('[intake] submit', insErr.message);
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }

    const location = typeof formData.parking_location === 'string' ? formData.parking_location.trim() : '';
    const vehicle = typeof formData.vehicle_year_make_model === 'string' ? formData.vehicle_year_make_model.trim() : '';
    const notesParts = [vehicle, location].filter(Boolean);

    await admin
      .from('appointments')
      .update({
        intake_completed_at: new Date().toISOString(),
        ...(notesParts.length ? { notes: notesParts.join(' · ') } : {}),
        ...(vehicle ? { vehicle_description: vehicle } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.warn('[intake] submit', e);
    return NextResponse.json({ ok: false, error: 'Submit failed' }, { status: 500 });
  }
}
