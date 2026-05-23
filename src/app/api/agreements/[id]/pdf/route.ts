import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { buildAgreementPdfBytes } from '@/lib/agreement-pdf';
import { resolveAgreementBody } from '@/lib/agreement-legal';
import { displayChicago, str } from '@/lib/display-format';
import { parseAgreementSnapshotFields } from '@/components/documents/agreement-document';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  const role = session.profile?.role ?? null;
  const allowed = session.user && (isAdminLevel(role) || role === 'technician' || role === 'customer');
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const [sourceRaw, rowIdRaw] = decoded.includes(':') ? decoded.split(':', 2) : ['signed_agreements', decoded];
  const source = sourceRaw === 'intake_submissions' || sourceRaw === 'job_agreements' ? sourceRaw : 'signed_agreements';
  const rowId = rowIdRaw?.trim();
  if (!rowId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data } = await admin.from(source).select('*').eq('id', rowId).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const row = data as Row;
  const appointmentId = str(row.appointment_id);
  const fallbackId = str(row.fallback_booking_id);
  const customerId = str(row.customer_id);
  const [apptRes, fallbackRes, customerRes] = await Promise.all([
    appointmentId ? admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle() : Promise.resolve({ data: null }),
    fallbackId ? admin.from('booking_fallbacks').select('*').eq('id', fallbackId).maybeSingle() : Promise.resolve({ data: null }),
    customerId ? admin.from('customers').select('*').eq('id', customerId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const appt = ((apptRes.data ?? fallbackRes.data) ?? {}) as Row;
  const customer = (customerRes.data ?? {}) as Row;
  const snapshot = row.agreement_snapshot ?? row.form_data ?? row.payload ?? row;
  const { body, legacyTermsWarning } = resolveAgreementBody(snapshot);
  const fields = parseAgreementSnapshotFields(snapshot, row, appt, customer);
  const vehicleRaw = Array.isArray(row.vehicle_data)
    ? row.vehicle_data
    : Array.isArray(appt.booking_vehicles)
      ? appt.booking_vehicles
      : [];
  const vehicles = (vehicleRaw as unknown[]).map((v, i) => {
    const vr = v && typeof v === 'object' ? (v as Row) : {};
    return {
      label: str(vr.vehicle_description || vr.description) || `Vehicle ${i + 1}`,
      service: str(vr.service_slug || appt.service_slug).replace(/-/g, ' ') || 'Service',
      color: str(vr.vehicle_color || vr.color) || 'Color not provided',
    };
  });
  if (!vehicles.length && str(appt.vehicle_description)) {
    vehicles.push({
      label: str(appt.vehicle_description),
      service: str(appt.service_slug).replace(/-/g, ' '),
      color: 'On file',
    });
  }

  const pdf = buildAgreementPdfBytes({
    title: fields.title,
    customerName: fields.customerName,
    customerEmail: fields.customerEmail || '—',
    customerPhone: fields.customerPhone || '—',
    serviceAddress: fields.serviceAddress || '—',
    vehicles,
    legalBody: body,
    signerLegalName: fields.signerLegalName || fields.customerName,
    smsConsent: fields.smsConsent,
    witnessName: fields.witnessName || 'Gloss Boss ATX',
    signedAt: displayChicago(row.signed_at || row.created_at),
    legacyTermsWarning,
  });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="agreement-${rowId.slice(0, 8)}.pdf"`,
    },
  });
}
