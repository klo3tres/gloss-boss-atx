import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { fetchJobMileageLogs } from '@/lib/operations-db';

export const runtime = 'nodejs';

function csvEscape(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function GET(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(request.url);
  const year = Number(url.searchParams.get('year') ?? new Date().getFullYear());
  const month = url.searchParams.get('month'); // 1-12 optional

  const { data: rows, error } = await fetchJobMileageLogs(gate.supabase, 500);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const apptIds = (rows ?? []).map((r) => String((r as Record<string, unknown>).appointment_id ?? '')).filter(Boolean);
  const apptMap = new Map<string, Record<string, unknown>>();
  if (apptIds.length > 0) {
    const { data: appts } = await gate.supabase
      .from('appointments')
      .select('id, guest_name, vehicle_description, service_address, service_city, service_state, service_zip, scheduled_start')
      .in('id', apptIds);
    for (const a of appts ?? []) apptMap.set(String((a as Record<string, unknown>).id), a as Record<string, unknown>);
  }

  type Row = {
    monthKey: string;
    date: string;
    customer: string;
    vehicle: string;
    address: string;
    oneWay: number;
    roundTrip: number;
    gas: string;
    appointmentId: string;
  };

  const parsed: Row[] = [];
  for (const raw of rows ?? []) {
    const r = raw as Record<string, unknown>;
    const logged = String(r.created_at ?? r.logged_on ?? '');
    const t = new Date(logged);
    if (Number.isNaN(t.getTime()) || t.getFullYear() !== year) continue;
    if (month) {
      const m = Number(month);
      if (m >= 1 && m <= 12 && t.getMonth() + 1 !== m) continue;
    }
    const appt = apptMap.get(String(r.appointment_id ?? ''));
    const miles =
      typeof r.total_miles === 'number'
        ? r.total_miles
        : typeof r.estimated_miles === 'number'
          ? r.estimated_miles
          : typeof r.miles === 'number'
            ? r.miles
            : 0;
    const addr = appt
      ? [appt.service_address, appt.service_city, appt.service_state, appt.service_zip].filter(Boolean).join(', ')
      : '';
    parsed.push({
      monthKey: `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`,
      date: t.toISOString().slice(0, 10),
      customer: String(appt?.guest_name ?? '—'),
      vehicle: String(appt?.vehicle_description ?? '—'),
      address: addr || '—',
      oneWay: miles,
      roundTrip: miles * 2,
      gas: typeof r.gas_cost_cents === 'number' ? (r.gas_cost_cents / 100).toFixed(2) : '',
      appointmentId: String(r.appointment_id ?? ''),
    });
  }

  parsed.sort((a, b) => a.monthKey.localeCompare(b.monthKey) || a.date.localeCompare(b.date));

  const header = [
    'Month',
    'Date',
    'Customer',
    'Vehicle',
    'Address',
    'Miles one-way',
    'Round-trip miles',
    'Gas estimate ($)',
    'Appointment ID',
  ];
  const lines = [header.join(',')];
  for (const row of parsed) {
    lines.push(
      [
        row.monthKey,
        row.date,
        row.customer,
        row.vehicle,
        row.address,
        String(row.oneWay),
        String(row.roundTrip),
        row.gas,
        row.appointmentId,
      ]
        .map((c) => csvEscape(c))
        .join(','),
    );
  }

  const body = lines.join('\n');
  const filename = month
    ? `gloss-boss-mileage-${year}-${String(month).padStart(2, '0')}.csv`
    : `gloss-boss-mileage-${year}.csv`;

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
