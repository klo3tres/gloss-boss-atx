import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { AgreementDocument, parseAgreementSnapshotFields } from '@/components/documents/agreement-document';
import { PrintDocumentActions } from '@/components/ui/print-document-actions';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

function str(v: unknown) {
  return v == null ? '' : String(v);
}

function chicago(v: unknown) {
  if (!v) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(str(v)));
}

export default async function AgreementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = tryCreateAdminSupabase();
  if (!admin) notFound();

  const decoded = decodeURIComponent(id);
  const [sourceRaw, rowIdRaw] = decoded.includes(':') ? decoded.split(':', 2) : ['signed_agreements', decoded];
  const source = sourceRaw === 'intake_submissions' || sourceRaw === 'job_agreements' ? sourceRaw : 'signed_agreements';
  const rowId = rowIdRaw?.trim();
  if (!rowId) notFound();

  const { data } = await admin.from(source).select('*').eq('id', rowId).maybeSingle();
  if (!data) notFound();
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
  const vehicleRaw = Array.isArray(row.vehicle_data)
    ? row.vehicle_data
    : Array.isArray(appt.booking_vehicles)
      ? appt.booking_vehicles
      : [];
  const fields = parseAgreementSnapshotFields(snapshot, row, appt, customer);
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

  const workOrderId = appointmentId || fallbackId;
  const captureHref = workOrderId
    ? `/tech/work-orders/${encodeURIComponent(workOrderId)}/recapture-agreement?shell=admin${fallbackId && !appointmentId ? '&source=fallback' : ''}`
    : `/agreement?${[
        customerId ? `customerId=${encodeURIComponent(customerId)}` : '',
        fields.customerEmail ? `email=${encodeURIComponent(fields.customerEmail)}` : '',
        fields.customerPhone ? `phone=${encodeURIComponent(fields.customerPhone)}` : '',
      ]
        .filter(Boolean)
        .join('&')}`;

  return (
    <DashboardShell title='Agreement detail' subtitle='Signed legal document snapshot — print shows only the agreement.' role='admin'>
      <div className='gb-no-print mb-4 flex flex-wrap gap-2'>
        <Link href='/admin/agreements' className='text-xs font-bold uppercase tracking-wider text-gold-soft underline'>
          ← Agreements
        </Link>
        <Link href={captureHref} className='rounded-xl border border-gold/35 px-4 py-2 text-xs font-black uppercase text-gold-soft'>
          Re-capture agreement
        </Link>
      </div>

      <PrintDocumentActions variant='agreement' />

      <AgreementDocument
        title={fields.title}
        customerName={fields.customerName}
        customerEmail={fields.customerEmail || '—'}
        customerPhone={fields.customerPhone || '—'}
        serviceAddress={fields.serviceAddress || '—'}
        vehicles={vehicles}
        snapshot={snapshot}
        signerLegalName={fields.signerLegalName || fields.customerName}
        signatureType={fields.signatureType}
        signatureData={fields.signatureData}
        smsConsent={fields.smsConsent}
        witnessName={fields.witnessName}
        signedAt={chicago(row.signed_at || row.created_at)}
      />
    </DashboardShell>
  );
}
