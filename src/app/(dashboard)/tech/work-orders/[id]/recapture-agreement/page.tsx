import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell, type DashboardShellRole } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveWorkOrder, vehiclesFromRow } from '@/lib/work-order-resolve';
import { displayLabel, displayMoney, displayText, str } from '@/lib/display-format';
import { buildNativeAgreementSnapshot, DEFAULT_AGREEMENT_TITLE } from '@/lib/default-gloss-boss-agreement';
import { WorkOrderAgreementRecaptureClient } from '@/components/tech/work-order-agreement-recapture-client';

export const dynamic = 'force-dynamic';

export default async function WorkOrderRecaptureAgreementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const shellRole: DashboardShellRole = str(sp.shell) === 'admin' ? 'admin' : 'technician';
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !admin) notFound();

  const resolved = await resolveWorkOrder(admin, id, str(sp.source));
  if (!resolved) notFound();

  const { row, canonicalId, isFallback, workflowSessionId } = resolved;
  const vehicles = vehiclesFromRow(row);
  const vehicleDescription = vehicles
    .map((v, i) => str(v.vehicle_description || v.description) || `Vehicle ${i + 1}`)
    .join(' · ');
  const totalCents = typeof row.base_price_cents === 'number' ? row.base_price_cents : 0;
  const agreementBody = buildNativeAgreementSnapshot({
    customerName: displayText(row.guest_name, 'Customer'),
    customerEmail: str(row.guest_email),
    customerPhone: str(row.guest_phone),
    vehicleDescription,
    serviceLabel: displayLabel(row.service_slug, 'Mobile detailing'),
    vehicleClassLabel: displayLabel(row.vehicle_class, 'Standard'),
    totalDollars: (totalCents / 100).toFixed(2),
    depositNote: 'Deposit and balance per shop policy on file.',
    technicianName: resolved.technicianName,
  });

  return (
    <DashboardShell title='Recapture agreement' subtitle='Workflow Step 6 acknowledgement — same legal snapshot as field workflow.' role={shellRole}>
      <Link href={`/tech/work-orders/${id}${shellRole === 'admin' ? '?shell=admin' : ''}`} className='mb-4 inline-block text-xs font-bold uppercase text-gold-soft underline'>
        ← Back to work order
      </Link>
      <WorkOrderAgreementRecaptureClient
        workOrderId={id}
        appointmentId={!isFallback ? canonicalId : null}
        fallbackBookingId={isFallback ? canonicalId : null}
        workflowSessionId={workflowSessionId}
        title={DEFAULT_AGREEMENT_TITLE}
        agreementBody={agreementBody}
        customerName={displayText(row.guest_name)}
        customerEmail={str(row.guest_email)}
        customerPhone={str(row.guest_phone)}
        vehicleSummary={vehicleDescription}
        serviceSlug={str(row.service_slug)}
        totalLabel={displayMoney(totalCents)}
      />
    </DashboardShell>
  );
}
