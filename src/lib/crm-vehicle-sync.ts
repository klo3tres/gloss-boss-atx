import type { SupabaseClient } from '@supabase/supabase-js';
import { vehiclesFromRow, type Row } from '@/lib/work-order-resolve';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function vehicleDescriptionFromLine(v: Row, index: number): string {
  const parts = [str(v.year), str(v.make), str(v.model)].filter(Boolean);
  const base = str(v.vehicle_description || v.description) || (parts.length ? parts.join(' ') : `Vehicle ${index + 1}`);
  const color = str(v.vehicle_color || v.color);
  return color ? `${base} · ${color}` : base;
}

function notesJson(v: Row) {
  return JSON.stringify({
    year: str(v.year),
    make: str(v.make),
    model: str(v.model),
    color: str(v.vehicle_color || v.color),
    vehicle_class: str(v.vehicle_class) || 'sedan',
    service_slug: str(v.service_slug),
    source: 'appointment_sync',
  });
}

function vehicleKey(year: string, make: string, model: string, color: string, description: string) {
  const core = [year, make, model].filter(Boolean).join(' ').trim().toLowerCase();
  if (core) return `${core}|${color.trim().toLowerCase()}`;
  return description.trim().toLowerCase();
}

async function existingVehicleKeys(admin: SupabaseClient, customerId: string) {
  const { data } = await admin.from('vehicles').select('description, notes').eq('customer_id', customerId).limit(200);
  const set = new Set<string>();
  for (const row of data ?? []) {
    const r = row as { description?: string; notes?: string };
    if (r.description) set.add(r.description.trim().toLowerCase());
    try {
      const n = r.notes ? (JSON.parse(r.notes) as { make?: string; model?: string; year?: string; color?: string }) : null;
      if (n) {
        set.add(vehicleKey(str(n.year), str(n.make), str(n.model), str(n.color), ''));
      }
    } catch {
      /* ignore */
    }
  }
  return set;
}

export async function syncVehiclesToCustomer(
  admin: SupabaseClient,
  params: {
    customerId: string;
    bookingVehicles?: unknown;
    vehicleDescription?: string | null;
    serviceSlug?: string | null;
    vehicleClass?: string | null;
  },
): Promise<{ inserted: number }> {
  const customerId = str(params.customerId);
  if (!customerId) return { inserted: 0 };

  const row: Row = {
    booking_vehicles: params.bookingVehicles,
    vehicle_description: params.vehicleDescription,
    service_slug: params.serviceSlug,
    vehicle_class: params.vehicleClass,
  };
  const lines = vehiclesFromRow(row);
  if (lines.length === 0) return { inserted: 0 };

  const seen = await existingVehicleKeys(admin, customerId);
  let inserted = 0;

  for (let i = 0; i < lines.length; i++) {
    const v = lines[i] as Row;
    const description = vehicleDescriptionFromLine(v, i);
    const key = vehicleKey(str(v.year), str(v.make), str(v.model), str(v.vehicle_color || v.color), description);
    if (seen.has(key) || seen.has(description.toLowerCase())) continue;
    seen.add(key);
    seen.add(description.toLowerCase());

    let ins = await admin.from('vehicles').insert({
      customer_id: customerId,
      description,
      notes: notesJson(v),
    });
    if (ins.error && /description|column|schema cache/i.test(ins.error.message)) {
      ins = await admin.from('vehicles').insert({
        customer_id: customerId,
        notes: `${description}\n${notesJson(v)}`,
      });
    }
    if (ins.error && /notes|column/i.test(ins.error.message)) {
      ins = await admin.from('vehicles').insert({ customer_id: customerId });
    }
    if (!ins.error) inserted += 1;
  }

  return { inserted };
}

/** Sync CRM vehicles from an appointment or fallback work order row. */
export async function syncVehiclesForWorkOrder(
  admin: SupabaseClient,
  params: { workOrderId: string; source: 'appointment' | 'fallback' },
): Promise<{ inserted: number; customerId: string | null }> {
  const id = str(params.workOrderId);
  if (!id) return { inserted: 0, customerId: null };
  const table = params.source === 'fallback' ? 'booking_fallbacks' : 'appointments';
  const { data } = await admin
    .from(table)
    .select('id, customer_id, guest_email, booking_vehicles, vehicle_description, service_slug, vehicle_class')
    .eq('id', id)
    .maybeSingle();
  const row = (data ?? null) as Row | null;
  if (!row) return { inserted: 0, customerId: null };

  let customerId = str(row.customer_id);
  if (!customerId) {
    const email = str(row.guest_email).toLowerCase();
    if (email) {
      const { data: cust } = await admin.from('customers').select('id').eq('email', email).maybeSingle();
      customerId = str((cust as Row | null)?.id);
    }
  }
  if (!customerId) return { inserted: 0, customerId: null };

  const { inserted } = await syncVehiclesToCustomer(admin, {
    customerId,
    bookingVehicles: row.booking_vehicles,
    vehicleDescription: str(row.vehicle_description),
    serviceSlug: str(row.service_slug),
    vehicleClass: str(row.vehicle_class),
  });
  return { inserted, customerId };
}

export async function syncVehiclesForAppointment(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<{ inserted: number; customerId: string | null }> {
  const id = str(appointmentId);
  if (!id) return { inserted: 0, customerId: null };

  const { data } = await admin
    .from('appointments')
    .select('id, customer_id, guest_email, booking_vehicles, vehicle_description, service_slug, vehicle_class')
    .eq('id', id)
    .maybeSingle();
  const appt = (data ?? null) as Row | null;
  if (!appt) return { inserted: 0, customerId: null };

  let customerId = str(appt.customer_id);
  if (!customerId) {
    const email = str(appt.guest_email).toLowerCase();
    if (email) {
      const { data: cust } = await admin.from('customers').select('id').eq('email', email).maybeSingle();
      customerId = str((cust as Row | null)?.id);
    }
  }
  if (!customerId) return { inserted: 0, customerId: null };

  const { inserted } = await syncVehiclesToCustomer(admin, {
    customerId,
    bookingVehicles: appt.booking_vehicles,
    vehicleDescription: str(appt.vehicle_description),
    serviceSlug: str(appt.service_slug),
    vehicleClass: str(appt.vehicle_class),
  });
  return { inserted, customerId };
}

export async function syncVehiclesForCustomerRecord(admin: SupabaseClient, customerId: string): Promise<{ inserted: number }> {
  const id = str(customerId);
  if (!id) return { inserted: 0 };

  const { data: cust } = await admin.from('customers').select('email').eq('id', id).maybeSingle();
  const email = str((cust as Row | null)?.email).toLowerCase();

  const { data: appts } = await admin
    .from('appointments')
    .select('id, customer_id, guest_email, booking_vehicles, vehicle_description, service_slug, vehicle_class')
    .or(email ? `customer_id.eq.${id},guest_email.eq.${email}` : `customer_id.eq.${id}`)
    .order('created_at', { ascending: false })
    .limit(80);

  let inserted = 0;
  for (const a of appts ?? []) {
    const r = await syncVehiclesToCustomer(admin, {
      customerId: id,
      bookingVehicles: (a as Row).booking_vehicles,
      vehicleDescription: str((a as Row).vehicle_description),
      serviceSlug: str((a as Row).service_slug),
      vehicleClass: str((a as Row).vehicle_class),
    });
    inserted += r.inserted;
  }
  return { inserted };
}

/** Backfill CRM vehicles from all appointments with a customer link or guest email match. */
export async function backfillAllAppointmentVehicles(admin: SupabaseClient): Promise<{ customers: number; inserted: number }> {
  const { data: appts } = await admin
    .from('appointments')
    .select('id, customer_id, guest_email, booking_vehicles, vehicle_description, service_slug, vehicle_class')
    .not('booking_vehicles', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500);

  const customerIds = new Set<string>();
  let inserted = 0;

  for (const a of appts ?? []) {
    const appt = a as Row;
    let customerId = str(appt.customer_id);
    if (!customerId) {
      const email = str(appt.guest_email).toLowerCase();
      if (!email) continue;
      const { data: cust } = await admin.from('customers').select('id').eq('email', email).maybeSingle();
      customerId = str((cust as Row | null)?.id);
      if (!customerId) continue;
    }
    customerIds.add(customerId);
    const r = await syncVehiclesToCustomer(admin, {
      customerId,
      bookingVehicles: appt.booking_vehicles,
      vehicleDescription: str(appt.vehicle_description),
      serviceSlug: str(appt.service_slug),
      vehicleClass: str(appt.vehicle_class),
    });
    inserted += r.inserted;
  }

  return { customers: customerIds.size, inserted };
}
