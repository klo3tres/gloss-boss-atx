import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { AgreementDocument, parseAgreementSnapshotFields } from '@/components/documents/agreement-document';
import { PrintDocumentActions } from '@/components/ui/print-document-actions';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { displayChicago, str } from '@/lib/display-format';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

export default async function CustomerAgreementViewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithProfile();
  if (!session.user) notFound();

  const { id: encoded } = await params;
  const decoded = decodeURIComponent(encoded);
  const [sourceRaw, rowIdRaw] = decoded.includes(':') ? decoded.split(':', 2) : ['signed_agreements', decoded];
  const source = sourceRaw === 'intake_submissions' || sourceRaw === 'job_agreements' ? sourceRaw : 'signed_agreements';
  const rowId = rowIdRaw?.trim();
  if (!rowId) notFound();

  const admin = tryCreateAdminSupabase();
  if (!admin) notFound();

  const { data } = await admin.from(source).select('*').eq('id', rowId).maybeSingle();
  if (!data) notFound();
  const row = data as Row;

  const appointmentId = str(row.appointment_id);
  if (appointmentId && session.user) {
    const { data: appt } = await admin.from('appointments').select('guest_email, customer_id').eq('id', appointmentId).maybeSingle();
    const apptRow = (appt ?? {}) as Row;
    const email = str(apptRow.guest_email).toLowerCase();
    const userEmail = (session.user.email ?? '').toLowerCase();
    if (email && userEmail && email !== userEmail) {
      const { data: cust } = await admin.from('customers').select('email').eq('id', str(apptRow.customer_id)).maybeSingle();
      if (str((cust as Row | null)?.email).toLowerCase() !== userEmail) notFound();
    }
  }

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
  const fields = parseAgreementSnapshotFields(snapshot, row, appt, customer);
  const vehicleRaw = Array.isArray(row.vehicle_data) ? row.vehicle_data : Array.isArray(appt.booking_vehicles) ? appt.booking_vehicles : [];
  const vehicles = (vehicleRaw as unknown[]).map((v, i) => {
    const vr = v && typeof v === 'object' ? (v as Row) : {};
    return {
      label: str(vr.vehicle_description || vr.description) || `Vehicle ${i + 1}`,
      service: str(vr.service_slug || appt.service_slug).replace(/-/g, ' ') || 'Service',
      color: str(vr.vehicle_color || vr.color) || '—',
    };
  });

  return (
    <DashboardShell title='Your agreement' subtitle='Signed legal snapshot — print or save as PDF.' role='customer'>
      <Link href='/dashboard' className='gb-no-print mb-4 inline-block text-xs font-bold uppercase text-gold-soft underline'>
        ← Dashboard
      </Link>
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
        signedAt={displayChicago(row.signed_at || row.created_at)}
      />
    </DashboardShell>
  );
}
