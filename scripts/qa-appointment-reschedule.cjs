const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const root = path.resolve(__dirname, '..');
for (const file of ['.env.production', '.env.local']) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) continue;
  for (const rawLine of fs.readFileSync(fullPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    if (!process.env[key] && value) process.env[key] = value;
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = (process.env.QA_PRODUCTION_URL || 'https://www.glossbossatx.com').replace(/\/$/, '');
if (!url || !serviceKey) process.exit(1);
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function chicagoParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type) => parts.find((value) => value.type === type)?.value || '';
  return {
    ymd: `${part('year')}-${part('month')}-${part('day')}`,
    weekday: part('weekday'),
    hour: Number(part('hour')),
    minute: Number(part('minute')),
  };
}

function findChicagoSlot(weekday, hour, minute, minimumDays) {
  for (let days = minimumDays; days < minimumDays + 100; days += 1) {
    const probe = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const ymd = chicagoParts(probe).ymd;
    for (const offset of ['-05:00', '-06:00']) {
      const candidate = new Date(`${ymd}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${offset}`);
      const local = chicagoParts(candidate);
      if (
        local.ymd === ymd &&
        local.weekday === weekday &&
        local.hour === hour &&
        local.minute === minute
      ) {
        return { ymd, time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, iso: candidate.toISOString() };
      }
    }
  }
  throw new Error(`Could not find a future ${weekday} test slot.`);
}

async function main() {
  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const token = randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const original = findChicagoSlot('Sat', 10, 0, 14);
  const conflict = findChicagoSlot('Sat', 10, 0, 28);
  const valid = findChicagoSlot('Sat', 10, 0, 42);
  const outside = findChicagoSlot('Mon', 10, 0, 21);
  let appointmentId = '';
  let blockerId = '';

  try {
    const appointment = await admin.from('appointments').insert({
      guest_name: '[QA] Reschedule Reliability',
      guest_email: null,
      guest_phone: null,
      access_token: token,
      status: 'confirmed',
      lifecycle_stage: 'scheduled',
      payment_status: 'deposit_paid',
      payment_choice: 'deposit',
      booking_vehicles: [{
        vehicle_description: 'Reschedule QA Vehicle',
        service_slug: 'full-detail',
        vehicle_class: 'sedan',
        price_cents: 13000,
      }],
      vehicle_description: 'Reschedule QA Vehicle',
      service_slug: 'full-detail',
      vehicle_class: 'sedan',
      base_price_cents: 13000,
      deposit_amount_cents: 3900,
      balance_due_cents: 9100,
      scheduled_start: original.iso,
      estimated_duration_minutes: 180,
      estimated_end: new Date(new Date(original.iso).getTime() + 180 * 60 * 1000).toISOString(),
      is_test: true,
      exclude_from_automations: true,
      exclude_from_customer_communications: true,
      qa_expires_at: expires,
    }).select('id').maybeSingle();
    if (appointment.error || !appointment.data?.id) {
      throw new Error(appointment.error?.message || 'Reschedule QA appointment creation failed.');
    }
    appointmentId = String(appointment.data.id);

    const blocker = await admin.from('appointments').insert({
      guest_name: '[QA] Temporary Reschedule Conflict',
      access_token: randomBytes(24).toString('hex'),
      status: 'confirmed',
      lifecycle_stage: 'scheduled',
      payment_status: 'deposit_paid',
      payment_choice: 'none',
      vehicle_description: 'Temporary Conflict Vehicle',
      service_slug: 'full-detail',
      vehicle_class: 'sedan',
      base_price_cents: 0,
      deposit_amount_cents: 0,
      balance_due_cents: 0,
      scheduled_start: conflict.iso,
      estimated_duration_minutes: 180,
      estimated_end: new Date(new Date(conflict.iso).getTime() + 180 * 60 * 1000).toISOString(),
      is_test: false,
      exclude_from_automations: true,
      exclude_from_customer_communications: true,
      qa_expires_at: expires,
    }).select('id').maybeSingle();
    if (blocker.error || !blocker.data?.id) {
      throw new Error(blocker.error?.message || 'Reschedule conflict fixture failed.');
    }
    blockerId = String(blocker.data.id);

    const endpoint = `${appUrl}/api/public/appointment-lifecycle`;
    const request = (body, accessToken = token) => fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reschedule', appointmentId, token: accessToken, ...body }),
    });

    let response = await request({ newDate: valid.ymd, newTime: valid.time }, 'wrong-token');
    assert(response.status === 403, 'Invalid secure token was accepted for reschedule.');

    const availability = async (slotDate, accessToken = token) => {
      const result = await fetch(
        `${endpoint}?appointmentId=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(accessToken)}&date=${encodeURIComponent(slotDate)}`,
        { cache: 'no-store' },
      );
      return { response: result, body: await result.json() };
    };
    let available = await availability(valid.ymd, 'wrong-token');
    assert(available.response.status === 403, 'Invalid secure token could read reschedule availability.');
    available = await availability(conflict.ymd);
    assert(
      available.response.ok &&
        Array.isArray(available.body.slots) &&
        !available.body.slots.some((slot) => slot.time === conflict.time),
      'Available-time picker offered a conflicting slot.',
    );
    available = await availability(valid.ymd);
    assert(
      available.response.ok &&
        Array.isArray(available.body.slots) &&
        available.body.slots.some((slot) => slot.time === valid.time),
      'Available-time picker omitted an open valid slot.',
    );

    response = await request({ newDate: outside.ymd, newTime: outside.time });
    let body = await response.json();
    assert(response.status === 409 && body.code === 'OUTSIDE_BOOKING_HOURS', 'Outside-hours reschedule was accepted.');

    response = await request({ newDate: conflict.ymd, newTime: conflict.time });
    body = await response.json();
    assert(response.status === 409 && body.code === 'SLOT_CONFLICT', 'Conflicting reschedule was accepted.');

    const unchangedAfterConflict = await admin.from('appointments').select('scheduled_start').eq('id', appointmentId).maybeSingle();
    assert(
      new Date(unchangedAfterConflict.data?.scheduled_start).getTime() === new Date(original.iso).getTime(),
      'Rejected reschedule changed the original appointment.',
    );

    response = await request({ newDate: valid.ymd, newTime: valid.time });
    body = await response.json();
    assert(response.ok && body.ok, `Valid reschedule failed: ${body.error || response.status}`);
    assert(new Date(body.scheduledStart).getTime() === new Date(valid.iso).getTime(), 'API returned the wrong new time.');

    response = await request({ newDate: valid.ymd, newTime: valid.time });
    body = await response.json();
    assert(response.ok && body.ok && body.alreadyRescheduled, 'Reschedule retry was not idempotent.');

    const updated = await admin.from('appointments')
      .select('scheduled_start, estimated_end, estimated_duration_minutes, rescheduled_from')
      .eq('id', appointmentId)
      .maybeSingle();
    assert(new Date(updated.data?.scheduled_start).getTime() === new Date(valid.iso).getTime(), 'Appointment did not retain the new time.');
    assert(new Date(updated.data?.rescheduled_from).getTime() === new Date(original.iso).getTime(), 'Original time was not retained for audit.');
    assert(
      new Date(updated.data?.estimated_end).getTime() > new Date(valid.iso).getTime(),
      'Estimated end did not move with the appointment.',
    );

    const summaryResponse = await fetch(
      `${appUrl}/api/public/booking-confirmation?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    );
    const summary = await summaryResponse.json();
    assert(
      summaryResponse.ok && new Date(summary.scheduledStart).getTime() === new Date(valid.iso).getTime(),
      'Customer booking state did not show the new time.',
    );

    const block = await admin.from('booking_availability_blocks')
      .select('start_at, end_at')
      .eq('appointment_id', appointmentId)
      .maybeSingle();
    assert(
      block.data && new Date(block.data.start_at).getTime() === new Date(valid.iso).getTime(),
      'Availability block did not move to the new time.',
    );
    const hold = await admin.from('booking_slot_holds')
      .select('status, appointment_id')
      .eq('booking_session_id', `reschedule_${appointmentId.replace(/-/g, '')}`)
      .maybeSingle();
    assert(hold.data?.status === 'booked' && hold.data?.appointment_id === appointmentId, 'Reschedule slot reservation was not finalized.');

    console.log(
      'Appointment reschedule production QA passed: secure-token rejection, business-hour and overlap gates, unchanged state after rejection, canonical new time/end/audit storage, idempotent retry, customer visibility, and moved availability reservation.',
    );
  } finally {
    if (appointmentId) {
      await admin.from('notification_outbox').delete().eq('appointment_id', appointmentId);
      await admin.from('booking_availability_blocks').delete().eq('appointment_id', appointmentId);
      await admin.from('booking_slot_holds').delete().eq('booking_session_id', `reschedule_${appointmentId.replace(/-/g, '')}`);
      await admin.from('google_calendar_sync_jobs').delete().eq('appointment_id', appointmentId);
    }
    if (blockerId) await admin.from('appointments').delete().eq('id', blockerId);
    if (appointmentId) await admin.from('appointments').delete().eq('id', appointmentId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
