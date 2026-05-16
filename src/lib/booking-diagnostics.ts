import type { SupabaseClient } from '@supabase/supabase-js';
import { insertAppointmentResilient } from '@/lib/booking-server-shared';

const SNAPSHOT_KEY = 'booking_health_snapshot';

export type BookingHealthSnapshot = {
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error_message: string | null;
  last_failure_stage: string | null;
};

export async function logBookingError(
  admin: SupabaseClient,
  row: {
    stage: string;
    error_message: string;
    error_code?: string | null;
    error_detail?: Record<string, unknown> | null;
    payload?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    await admin.from('booking_errors').insert({
      stage: row.stage.slice(0, 200),
      error_message: row.error_message.slice(0, 8000),
      error_code: row.error_code?.slice(0, 200) ?? null,
      error_detail: row.error_detail ?? null,
      payload: row.payload ?? null,
    });
  } catch (e) {
    console.error('[booking-diagnostics] logBookingError failed', e);
  }
}

async function readSnapshot(admin: SupabaseClient): Promise<BookingHealthSnapshot> {
  const base: BookingHealthSnapshot = {
    last_success_at: null,
    last_failure_at: null,
    last_error_message: null,
    last_failure_stage: null,
  };
  try {
    const { data } = await admin.from('site_settings').select('value').eq('key', SNAPSHOT_KEY).maybeSingle();
    if (!data?.value) return base;
    const j = JSON.parse(String(data.value)) as Partial<BookingHealthSnapshot>;
    return { ...base, ...j };
  } catch {
    return base;
  }
}

async function writeSnapshot(admin: SupabaseClient, snap: BookingHealthSnapshot): Promise<void> {
  try {
    await admin.from('site_settings').upsert(
      {
        key: SNAPSHOT_KEY,
        value: JSON.stringify(snap),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );
  } catch (e) {
    console.error('[booking-diagnostics] writeSnapshot failed', e);
  }
}

export async function recordBookingSuccess(admin: SupabaseClient): Promise<void> {
  const prev = await readSnapshot(admin);
  await writeSnapshot(admin, {
    ...prev,
    last_success_at: new Date().toISOString(),
  });
}

export async function recordBookingFailure(
  admin: SupabaseClient,
  detail: { stage: string; message: string },
): Promise<void> {
  const prev = await readSnapshot(admin);
  await writeSnapshot(admin, {
    ...prev,
    last_failure_at: new Date().toISOString(),
    last_error_message: detail.message.slice(0, 2000),
    last_failure_stage: detail.stage.slice(0, 200),
  });
}

export async function getBookingHealthSnapshot(admin: SupabaseClient): Promise<BookingHealthSnapshot> {
  return readSnapshot(admin);
}

export type BookingFallbackRow = {
  id: string;
  access_token: string;
  payload: Record<string, unknown>;
  guest_email: string | null;
  deposit_amount_cents: number;
  base_price_cents: number | null;
  scheduled_start: string | null;
  status: string;
  converted_appointment_id: string | null;
  stripe_checkout_session_id: string | null;
};

export async function saveBookingFallback(
  admin: SupabaseClient,
  params: {
    payload: Record<string, unknown>;
    guestEmail: string;
    guestPhone: string;
    guestName: string;
    depositAmountCents: number;
    basePriceCents: number;
    scheduledStartIso: string;
  },
): Promise<{ id: string; access_token: string } | null> {
  try {
    const { data, error } = await admin
      .from('booking_fallbacks')
      .insert({
        payload: params.payload,
        guest_email: params.guestEmail,
        guest_phone: params.guestPhone,
        guest_name: params.guestName,
        deposit_amount_cents: params.depositAmountCents,
        base_price_cents: params.basePriceCents,
        scheduled_start: params.scheduledStartIso,
        service_address: params.payload.service_address ?? null,
        service_city: params.payload.service_city ?? null,
        service_state: params.payload.service_state ?? null,
        service_zip: params.payload.service_zip ?? null,
        service_address_notes: params.payload.service_address_notes ?? null,
        booking_vehicles: params.payload.booking_vehicles ?? [],
        promo_code: params.payload.promo_code ?? null,
        payment_status: params.payload.payment_status ?? null,
        comp_reason: params.payload.comp_reason ?? null,
        status: 'pending',
      })
      .select('id, access_token')
      .single();
    if (error || !data) {
      console.error('[booking-fallback] saveBookingFallback', error?.message);
      return null;
    }
    return { id: String(data.id), access_token: String(data.access_token) };
  } catch (e) {
    console.error('[booking-fallback] saveBookingFallback unexpected', e);
    return null;
  }
}

export async function loadBookingFallback(
  admin: SupabaseClient,
  fallbackId: string,
  accessToken: string,
): Promise<BookingFallbackRow | null> {
  const { data, error } = await admin.from('booking_fallbacks').select('*').eq('id', fallbackId).maybeSingle();
  if (error || !data) return null;
  if (String(data.access_token) !== accessToken) return null;
  return data as unknown as BookingFallbackRow;
}

export async function promoteFallbackToAppointment(
  admin: SupabaseClient,
  fallbackId: string,
  accessToken: string,
): Promise<{ id: string; access_token: string } | null> {
  const row = await loadBookingFallback(admin, fallbackId, accessToken);
  if (!row) return null;
  if (row.converted_appointment_id) {
    const { data: ap } = await admin
      .from('appointments')
      .select('id, access_token')
      .eq('id', row.converted_appointment_id)
      .maybeSingle();
    if (ap?.id && ap.access_token) {
      return { id: String(ap.id), access_token: String(ap.access_token) };
    }
  }

  const payload =
    row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? { ...(row.payload as Record<string, unknown>) }
      : {};
  const { data: appt, error: apptErr } = await insertAppointmentResilient(admin, payload);
  if (!appt || apptErr) {
    const msg = apptErr ?? 'promote insert failed';
    console.error('[booking-fallback] promoteFallbackToAppointment failed', msg);
    await admin
      .from('booking_fallbacks')
      .update({
        promotion_error: String(msg).slice(0, 4000),
        updated_at: new Date().toISOString(),
      })
      .eq('id', fallbackId);
    return null;
  }

  await admin
    .from('booking_fallbacks')
    .update({
      converted_appointment_id: appt.id,
      status: 'converted',
      promotion_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', fallbackId);

  return { id: appt.id, access_token: appt.access_token };
}
