import type { SupabaseClient } from '@supabase/supabase-js';
import { isSchemaDriftError } from '@/lib/booking-server-shared';

/** Columns needed for walk-in agreement signing; tolerate missing optional columns. */
const APPT_SIGN_SELECT_FULL =
  'id, assigned_technician_id, guest_name, guest_email, guest_phone, vehicle_description, service_slug, vehicle_class, base_price_cents, deposit_amount_cents, customer_id, vehicle_id';

const APPT_SIGN_SELECT_LEAN =
  'id, assigned_technician_id, guest_name, guest_email, guest_phone, vehicle_description, service_slug, vehicle_class, base_price_cents, deposit_amount_cents, customer_id';

const APPT_SIGN_SELECT_MINIMAL =
  'id, assigned_technician_id, guest_name, guest_email, guest_phone, vehicle_description, service_slug, vehicle_class, base_price_cents';

export type AppointmentForTechSign = {
  id: string;
  assigned_technician_id?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  vehicle_description?: string | null;
  service_slug?: string | null;
  vehicle_class?: string | null;
  base_price_cents?: number | null;
  deposit_amount_cents?: number | null;
  customer_id?: string | null;
  vehicle_id?: string | null;
};

/**
 * Load one appointment for tech agreement signing. Retries with a leaner select when PostgREST
 * errors on unknown columns (common cause of false "job not found" when `vehicle_id` etc. drift).
 */
export async function fetchAppointmentForTechSign(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<{ data: AppointmentForTechSign | null; error: string | null }> {
  let res = await admin.from('appointments').select(APPT_SIGN_SELECT_FULL).eq('id', appointmentId).maybeSingle();
  if (res.error && isSchemaDriftError(res.error.message)) {
    res = await admin.from('appointments').select(APPT_SIGN_SELECT_LEAN).eq('id', appointmentId).maybeSingle();
  }
  if (res.error && isSchemaDriftError(res.error.message)) {
    res = await admin.from('appointments').select(APPT_SIGN_SELECT_MINIMAL).eq('id', appointmentId).maybeSingle();
  }
  if (res.error) {
    return { data: null, error: res.error.message };
  }
  const row = res.data as AppointmentForTechSign | null;
  return { data: row?.id ? row : null, error: null };
}
