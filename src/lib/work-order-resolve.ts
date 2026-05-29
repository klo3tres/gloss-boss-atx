import type { SupabaseClient } from '@supabase/supabase-js';

export type WorkOrderSource = 'appointment' | 'fallback';

export type Row = Record<string, unknown>;

const APPT_SELECT =
  'id, status, access_token, customer_id, assigned_technician_id, guest_name, guest_phone, guest_email, service_slug, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, service_address_notes, service_location_type, water_access, power_access, parking_access, gate_access_notes, vehicle_class, base_price_cents, balance_due_cents, payment_status, payment_choice, notes, intake_completed_at, scheduled_start, estimated_end, estimated_duration_minutes, job_started_at, job_completed_at, completed_at, booking_pricing_breakdown, deposit_amount_cents';

const FB_SELECT =
  'id, status, access_token, customer_id, assigned_technician_id, guest_name, guest_phone, guest_email, service_slug, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, service_address_notes, service_location_type, water_access, power_access, parking_access, gate_access_notes, vehicle_class, base_price_cents, balance_due_cents, payment_status, payment_choice, payload, created_at, scheduled_start, estimated_end, estimated_duration_minutes, job_started_at, job_completed_at, deposit_amount_cents';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function payloadObject(v: unknown): Row {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {};
}

function mergePayloadIntoRow(base: Row, payload: Row): Row {
  return {
    ...base,
    guest_name: base.guest_name ?? payload.guest_name ?? payload.customerName ?? payload.customer_name,
    guest_phone: base.guest_phone ?? payload.guest_phone ?? payload.customerPhone ?? payload.customer_phone,
    guest_email: base.guest_email ?? payload.guest_email ?? payload.customerEmail ?? payload.customer_email,
    service_slug: base.service_slug ?? payload.service_slug ?? payload.serviceSlug,
    vehicle_description: base.vehicle_description ?? payload.vehicle_description ?? payload.vehicleDescription,
    booking_vehicles: base.booking_vehicles ?? payload.booking_vehicles ?? payload.vehicles,
    service_address: base.service_address ?? payload.service_address ?? payload.serviceAddress,
    service_city: base.service_city ?? payload.service_city,
    service_state: base.service_state ?? payload.service_state,
    service_zip: base.service_zip ?? payload.service_zip,
    vehicle_class: base.vehicle_class ?? payload.vehicle_class ?? payload.vehicleClass,
    base_price_cents: base.base_price_cents ?? payload.base_price_cents ?? payload.total_cents,
    balance_due_cents: base.balance_due_cents ?? payload.balance_due_cents ?? 0,
    payment_status: base.payment_status ?? payload.payment_status ?? 'pending',
    scheduled_start: base.scheduled_start ?? payload.scheduled_start,
    estimated_end: base.estimated_end ?? payload.estimated_end,
    estimated_duration_minutes: base.estimated_duration_minutes ?? payload.estimated_duration_minutes,
    service_location_type: base.service_location_type ?? payload.service_location_type,
    water_access: base.water_access ?? payload.water_access,
    power_access: base.power_access ?? payload.power_access,
    parking_access: base.parking_access ?? payload.parking_access,
    gate_access_notes: base.gate_access_notes ?? payload.gate_access_notes ?? payload.service_address_notes,
    service_address_notes: base.service_address_notes ?? payload.service_address_notes,
  };
}

const APPT_SELECT_LEAN =
  'id, status, access_token, customer_id, assigned_technician_id, guest_name, guest_phone, guest_email, service_slug, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, vehicle_class, base_price_cents, balance_due_cents, payment_status, notes, intake_completed_at, scheduled_start, job_started_at, job_completed_at, completed_at, booking_pricing_breakdown, deposit_amount_cents';

const FB_SELECT_LEAN =
  'id, status, access_token, customer_id, assigned_technician_id, guest_name, guest_phone, guest_email, service_slug, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, vehicle_class, base_price_cents, balance_due_cents, payment_status, payload, created_at, scheduled_start, job_started_at, job_completed_at, deposit_amount_cents';

function isSelectDrift(msg: string) {
  return /column|schema cache|Could not find/i.test(msg);
}

async function loadAppointment(admin: SupabaseClient, id: string): Promise<Row | null> {
  let res = await admin.from('appointments').select(APPT_SELECT).eq('id', id).maybeSingle();
  if (res.error && isSelectDrift(res.error.message)) {
    res = await admin.from('appointments').select(APPT_SELECT_LEAN).eq('id', id).maybeSingle();
  }
  return (res.data ?? null) as Row | null;
}

async function loadFallback(admin: SupabaseClient, id: string): Promise<Row | null> {
  let res = await admin.from('booking_fallbacks').select(FB_SELECT).eq('id', id).maybeSingle();
  if (res.error && isSelectDrift(res.error.message)) {
    res = await admin.from('booking_fallbacks').select(FB_SELECT_LEAN).eq('id', id).maybeSingle();
  }
  const data = res.data;
  const row = (data ?? null) as Row | null;
  if (!row) return null;
  return mergePayloadIntoRow(row, payloadObject(row.payload));
}

async function loadAppointmentList(admin: SupabaseClient, filter: { column: string; value: string }) {
  let res = await admin.from('appointments').select(APPT_SELECT).eq(filter.column, filter.value).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (res.error && isSelectDrift(res.error.message)) {
    res = await admin.from('appointments').select(APPT_SELECT_LEAN).eq(filter.column, filter.value).order('created_at', { ascending: false }).limit(1).maybeSingle();
  }
  return (res.data ?? null) as Row | null;
}

async function loadByCustomer(admin: SupabaseClient, customerId: string): Promise<{ row: Row; source: WorkOrderSource } | null> {
  const apptRow = await loadAppointmentList(admin, { column: 'customer_id', value: customerId });
  if (apptRow) return { row: apptRow, source: 'appointment' };
  let fb = await admin
    .from('booking_fallbacks')
    .select(FB_SELECT)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fb.error && isSelectDrift(fb.error.message)) {
    fb = await admin
      .from('booking_fallbacks')
      .select(FB_SELECT_LEAN)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
  }
  if (fb.data) {
    const row = mergePayloadIntoRow(fb.data as Row, payloadObject((fb.data as Row).payload));
    return { row, source: 'fallback' };
  }
  return null;
}

export type ResolvedWorkOrder = {
  workOrderId: string;
  canonicalId: string;
  source: WorkOrderSource;
  isFallback: boolean;
  row: Row;
  workflowSessionIds: string[];
  workflowSessionId: string | null;
  customer: Row | null;
  technicianName: string | null;
  /** True only when no DB job row exists and URL id is orphan timer/session only */
  orphanSession: boolean;
  /** Loaded from lean select when full resolver paths failed */
  partial?: boolean;
};

export { workOrderPath } from '@/lib/work-order-links';

async function loadAppointmentPartial(admin: SupabaseClient, id: string): Promise<Row | null> {
  const { data } = await admin
    .from('appointments')
    .select(
      'id, status, access_token, customer_id, assigned_technician_id, guest_name, guest_phone, guest_email, service_slug, vehicle_description, booking_vehicles, vehicle_class, base_price_cents, balance_due_cents, payment_status, payment_choice, booking_source, booking_pricing_breakdown, deposit_amount_cents, stripe_checkout_session_id, scheduled_start, service_address, service_city, service_state, service_zip',
    )
    .eq('id', id)
    .maybeSingle();
  return (data ?? null) as Row | null;
}

async function loadFallbackPartial(admin: SupabaseClient, id: string): Promise<Row | null> {
  const { data } = await admin
    .from('booking_fallbacks')
    .select(
      'id, status, access_token, customer_id, assigned_technician_id, guest_name, guest_phone, guest_email, service_slug, vehicle_description, booking_vehicles, vehicle_class, base_price_cents, balance_due_cents, payment_status, payment_choice, booking_source, booking_pricing_breakdown, deposit_amount_cents, payload, scheduled_start, service_address, service_city, service_state, service_zip',
    )
    .eq('id', id)
    .maybeSingle();
  const row = (data ?? null) as Row | null;
  if (!row) return null;
  return mergePayloadIntoRow(row, payloadObject(row.payload));
}

export async function resolveWorkOrder(admin: SupabaseClient, workOrderId: string, _hintSource?: string): Promise<ResolvedWorkOrder | null> {
  const id = str(workOrderId);
  if (!id) return null;

  let source: WorkOrderSource = 'appointment';
  let row: Row | null = null;
  let workflowSessionIds: string[] = [];
  let orphanSession = false;
  let partial = false;

  row = await loadAppointment(admin, id);
  if (!row) {
    row = await loadFallback(admin, id);
    if (row) source = 'fallback';
  }

  if (!row) {
    const wf = await admin.from('tech_workflow_sessions').select('*').eq('id', id).maybeSingle();
    const wfRow = (wf.data ?? null) as Row | null;
    if (wfRow) {
      workflowSessionIds = [id];
      const apptId = str(wfRow.appointment_id);
      const fbId = str(wfRow.fallback_booking_id);
      if (apptId) {
        row = await loadAppointment(admin, apptId);
        source = 'appointment';
      } else if (fbId) {
        row = await loadFallback(admin, fbId);
        source = 'fallback';
      } else {
        const payload = payloadObject(wfRow.payload);
        row = mergePayloadIntoRow(
          {
            id: apptId || fbId || id,
            status: wfRow.status ?? 'in_progress',
            assigned_technician_id: wfRow.technician_id,
            customer_name: wfRow.customer_name,
            vehicle_summary: wfRow.vehicle_summary,
            service_slug: wfRow.service_slug,
            total_cents: wfRow.total_cents,
          },
          payload,
        );
        orphanSession = true;
      }
    }
  }

  if (!row) {
    const timer = await admin.from('tech_job_timers').select('*').eq('id', id).maybeSingle();
    const timerRow = (timer.data ?? null) as Row | null;
    if (timerRow) {
      const apptId = str(timerRow.appointment_id);
      const fbId = str(timerRow.fallback_booking_id);
      const wfId = str(timerRow.workflow_session_id);
      if (apptId) {
        row = await loadAppointment(admin, apptId);
        source = 'appointment';
      } else if (fbId) {
        row = await loadFallback(admin, fbId);
        source = 'fallback';
      } else if (wfId) {
        const nested = await resolveWorkOrder(admin, wfId);
        if (nested) return { ...nested, workOrderId: id };
      } else {
        orphanSession = true;
        row = {
          id,
          status: 'in_progress',
          assigned_technician_id: timerRow.technician_id,
          payment_status: 'pending',
          balance_due_cents: 0,
        };
      }
    }
  }

  if (!row) {
    const byCustomer = await loadByCustomer(admin, id);
    if (byCustomer) {
      row = byCustomer.row;
      source = byCustomer.source;
    }
  }

  if (!row) {
    const partialAppt = await loadAppointmentPartial(admin, id);
    if (partialAppt) {
      row = partialAppt;
      source = 'appointment';
      partial = true;
    } else {
      const partialFb = await loadFallbackPartial(admin, id);
      if (partialFb) {
        row = partialFb;
        source = 'fallback';
        partial = true;
      }
    }
  }

  if (!row) return null;

  const canonicalId = str(row.id) || id;
  const isFallback = source === 'fallback';

  const wfQuery = await admin
    .from('tech_workflow_sessions')
    .select('id, started_at, created_at, payload, customer_name, vehicle_summary, service_slug, total_cents')
    .or(isFallback ? `fallback_booking_id.eq.${canonicalId}` : `appointment_id.eq.${canonicalId}`)
    .limit(10);
  workflowSessionIds = [
    ...new Set([
      ...workflowSessionIds,
      ...((wfQuery.data ?? []) as Row[]).map((r) => str(r.id)).filter(Boolean),
    ]),
  ];

  const customerId = str(row.customer_id);
  let customer: Row | null = null;
  if (customerId) {
    const { data: cust } = await admin.from('customers').select('*').eq('id', customerId).maybeSingle();
    customer = (cust ?? null) as Row | null;
    if (customer) {
      row = {
        ...row,
        guest_name: row.guest_name || customer.full_name,
        guest_email: row.guest_email || customer.email,
        guest_phone: row.guest_phone || customer.phone,
      };
    }
  }

  const techId = str(row.assigned_technician_id);
  let technicianName: string | null = null;
  if (techId) {
    const { data: tech } = await admin.from('profiles').select('full_name, email').eq('id', techId).maybeSingle();
    technicianName = str((tech as Row | null)?.full_name) || str((tech as Row | null)?.email) || null;
  }

  return {
    workOrderId: id,
    canonicalId,
    source,
    isFallback,
    row,
    workflowSessionIds,
    workflowSessionId: workflowSessionIds[0] ?? null,
    customer,
    technicianName,
    orphanSession,
    partial,
  };
}

export function vehiclesFromRow(row: Row): Row[] {
  if (Array.isArray(row.booking_vehicles) && row.booking_vehicles.length > 0) {
    return row.booking_vehicles as Row[];
  }
  if (str(row.vehicle_description)) {
    return [
      {
        vehicle_description: row.vehicle_description,
        vehicle_color: null,
        service_slug: row.service_slug,
        vehicle_class: row.vehicle_class,
      },
    ];
  }
  return [];
}

export function vehicleParts(v: Row) {
  const raw = str(v.vehicle_description || v.description);
  const parts = raw.split(/\s+/).filter(Boolean);
  const year = parts.find((p) => /^(19|20)\d{2}$/.test(p)) ?? str(v.year);
  const rest = year ? parts.filter((p) => p !== year) : parts;
  return {
    year: str(year),
    make: str(v.make || rest[0]),
    model: str(v.model || rest.slice(1).join(' ')) || raw,
    description: raw,
  };
}
