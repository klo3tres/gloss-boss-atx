import { notFound } from 'next/navigation';
import { DashboardShell, type DashboardShellRole } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { buildAppointmentScheduleFields } from '@/lib/booking-slot-blocking';
import { totalBookingDurationMinutes } from '@/lib/booking-service-duration';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { syncVehiclesForWorkOrder } from '@/lib/crm-vehicle-sync';
import { resolveJobPricing, syncJobBalanceDue } from '@/lib/job-pricing-display';
import { fetchPaymentsForJob } from '@/lib/payments-resolve';
import { resolveWorkOrder, vehicleParts, vehiclesFromRow, type Row } from '@/lib/work-order-resolve';
import { displayChicago, displayLabel, displayMoney, displayPhone, displayText, str } from '@/lib/display-format';
import { techCompleteJobAction, techRecordCashPaymentAction, techSaveJobNotesAction } from '../../tech-actions';
import { revalidatePath } from 'next/cache';
import { WorkOrderConsoleClient, type WorkOrderConsoleData } from '@/components/tech/work-order-console-client';
import { WorkOrderErrorCard } from '@/components/tech/work-order-error-card';
import { WorkOrderDebugPanel } from '@/components/tech/work-order-debug-panel';
import type { WorkOrderGalleryPhoto } from '../../work-order-gallery';
import { resolvePhotoPhase, resolvePhotoSlot } from '@/lib/photo-phase';

export const dynamic = 'force-dynamic';

function photoVehicleIndex(row: Row, vehicleCount: number): number {
  const vi = row.vehicle_index;
  if (typeof vi === 'number' && vi >= 0 && vi < vehicleCount) return vi;
  const parsed = Number(vi);
  if (Number.isFinite(parsed) && parsed >= 0 && parsed < vehicleCount) return parsed;
  return 0;
}

function photoUrl(row: Row) {
  return str(row.thumbnail_url || row.public_url || row.media_url || row.file_url);
}

function mapsHref(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

async function completeWorkOrderFormAction(formData: FormData) {
  'use server';
  await techCompleteJobAction(null, formData);
}

async function saveVehicleNotesAction(formData: FormData) {
  'use server';
  await techSaveJobNotesAction(formData);
}

async function updateWorkOrderDetailsAction(formData: FormData) {
  'use server';
  const admin = tryCreateAdminSupabase();
  if (!admin) return;
  const id = str(formData.get('id')).trim();
  const source = str(formData.get('source')).trim();
  if (!id) return;
  const table = source === 'fallback' ? 'booking_fallbacks' : 'appointments';
  const patch = {
    guest_name: str(formData.get('guestName')).trim() || null,
    guest_email: str(formData.get('guestEmail')).trim().toLowerCase() || null,
    guest_phone: str(formData.get('guestPhone')).replace(/\D/g, '') || null,
    service_address: str(formData.get('serviceAddress')).trim() || null,
    service_city: str(formData.get('serviceCity')).trim() || null,
    service_state: str(formData.get('serviceState')).trim().toUpperCase() || null,
    service_zip: str(formData.get('serviceZip')).replace(/\D/g, '').slice(0, 5) || null,
    updated_at: new Date().toISOString(),
  };
  await admin.from(table).update(patch).eq('id', id);
  revalidatePath(`/tech/work-orders/${id}`);
  revalidatePath('/tech');
  revalidatePath('/admin/work-orders');
}

async function updateWorkOrderVehiclesAction(formData: FormData) {
  'use server';
  const admin = tryCreateAdminSupabase();
  if (!admin) return;
  const id = str(formData.get('id')).trim();
  const source = str(formData.get('source')).trim();
  if (!id) return;
  const table = source === 'fallback' ? 'booking_fallbacks' : 'appointments';
  const { data: jobRow } = await admin.from(table).select('scheduled_start, deposit_amount_cents, payment_status').eq('id', id).maybeSingle();
  const scheduledIso = str((jobRow as Row | null)?.scheduled_start) || new Date().toISOString();
  const descriptions = formData.getAll('vehicleDescription').map((v) => str(v).trim());
  const years = formData.getAll('vehicleYear').map((v) => str(v).trim());
  const makes = formData.getAll('vehicleMake').map((v) => str(v).trim());
  const models = formData.getAll('vehicleModel').map((v) => str(v).trim());
  const colors = formData.getAll('vehicleColor').map((v) => str(v).trim());
  const services = formData.getAll('vehicleService').map((v) => str(v).trim());
  const classes = formData.getAll('vehicleClass').map((v) => str(v).trim());
  const prices = formData.getAll('vehiclePriceCents').map((v) => Number(str(v)) || 0);
  const vehicles = descriptions
    .map((description, index) => ({
      year: years[index] || null,
      make: makes[index] || null,
      model: models[index] || null,
      vehicle_description: description || [years[index], makes[index], models[index]].filter(Boolean).join(' ') || `Vehicle ${index + 1}`,
      vehicle_color: colors[index] || null,
      service_slug: services[index] || null,
      vehicle_class: classes[index] || null,
      price_cents: prices[index] > 0 ? prices[index] : null,
    }))
    .filter((v) => str(v.vehicle_description));
  const baseTotal = vehicles.reduce((s, v) => s + (typeof v.price_cents === 'number' ? v.price_cents : 0), 0);
  const patch: Row = {
    booking_vehicles: vehicles,
    vehicle_description: vehicles.map((v) => v.vehicle_description).join(' · '),
    service_slug: vehicles[0]?.service_slug,
    vehicle_class: vehicles[0]?.vehicle_class,
    updated_at: new Date().toISOString(),
  };
  if (baseTotal > 0) {
    const { data: existing } = await admin.from(table).select('deposit_amount_cents, payment_status, booking_pricing_breakdown').eq('id', id).maybeSingle();
    const prevBreakdown =
      (existing as Row | null)?.booking_pricing_breakdown && typeof (existing as Row).booking_pricing_breakdown === 'object'
        ? ((existing as Row).booking_pricing_breakdown as Row)
        : {};
    const multiCarDiscountCents = typeof prevBreakdown.multiCarDiscountCents === 'number' ? Number(prevBreakdown.multiCarDiscountCents) : 0;
    const onlineDiscountCents =
      typeof prevBreakdown.websitePromoDiscountCents === 'number'
        ? Number(prevBreakdown.websitePromoDiscountCents)
        : typeof prevBreakdown.onlineDiscountCents === 'number'
          ? Number(prevBreakdown.onlineDiscountCents)
          : 0;
    const promoDiscountCents =
      typeof prevBreakdown.offerDiscountCents === 'number'
        ? Number(prevBreakdown.offerDiscountCents)
        : typeof prevBreakdown.promoDiscountCents === 'number'
          ? Number(prevBreakdown.promoDiscountCents)
          : 0;
    const finalTotalCents = Math.max(0, baseTotal - multiCarDiscountCents - onlineDiscountCents - promoDiscountCents);
    patch.base_price_cents = finalTotalCents;
    patch.booking_pricing_breakdown = {
      ...prevBreakdown,
      vehicleSubtotalCents: baseTotal,
      prePromoCents: baseTotal,
      finalTotalCents,
      multiCarDiscountCents,
      websitePromoDiscountCents: onlineDiscountCents,
      offerDiscountCents: promoDiscountCents,
    };
    const deposit = typeof (existing as Row | null)?.deposit_amount_cents === 'number' ? Number((existing as Row).deposit_amount_cents) : 0;
    const paid = ['paid', 'paid_cash', 'full_paid', 'comped', 'test_comped'].includes(str((existing as Row | null)?.payment_status).toLowerCase());
    if (!paid) patch.balance_due_cents = Math.max(0, finalTotalCents - deposit);
    const scheduleLines = vehicles.map((v) => ({
      serviceSlug: str(v.service_slug) || 'exterior-wash',
      vehicleClass: str(v.vehicle_class) || 'sedan',
    }));
    Object.assign(patch, buildAppointmentScheduleFields(scheduledIso, scheduleLines));
    patch.estimated_duration_minutes = totalBookingDurationMinutes(scheduleLines);
  }
  await admin.from(table).update(patch).eq('id', id);

  const woSource = source === 'fallback' ? 'fallback' : 'appointment';
  const sync = await syncVehiclesForWorkOrder(admin, { workOrderId: id, source: woSource });
  if (sync.customerId) {
    revalidatePath(`/admin/customers/${sync.customerId}`);
    revalidatePath('/admin/customers');
  }

  revalidatePath(`/tech/work-orders/${id}`);
  revalidatePath('/tech');
  revalidatePath('/admin/work-orders');
  revalidatePath('/dashboard');
}

export default async function TechWorkOrderDetailPage({
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

  const showDebug = isAdminLevel(session.profile?.role ?? null);
  const backHref = shellRole === 'admin' ? '/admin/work-orders' : '/tech';

  try {
  const resolved = await resolveWorkOrder(admin, id, str(sp.source));
  if (!resolved) {
    console.warn('[work-order] not found', { workOrderId: id, source: str(sp.source), userId: session.user.id });
    notFound();
  }

  const { row, canonicalId, isFallback, workflowSessionIds, workflowSessionId, partial: partialLoad } = resolved;
  const queryId = canonicalId;

  const assigned = str(row.assigned_technician_id);
  const role = session.profile?.role;
  if (assigned && assigned !== session.user.id && role === 'technician' && !isAdminLevel(role)) notFound();

  const mediaRows: Row[] = [];
  for (const table of ['job_photos', 'job_media'] as const) {
    const cols =
      'id, category, photo_category, file_url, media_url, public_url, thumbnail_url, storage_path, storage_bucket, uploaded_by, technician_id, created_at, workflow_session_id, vehicle_index, vehicle_label';
    const direct = await admin
      .from(table)
      .select(cols)
      .eq(isFallback ? 'fallback_booking_id' : 'appointment_id', queryId)
      .limit(120);
    if (!direct.error) {
      for (const r of direct.data ?? []) {
        mediaRows.push({ ...(r as Row), _source_table: table });
      }
    }
    if (workflowSessionIds.length > 0) {
      const byWorkflow = await admin
        .from(table)
        .select(cols)
        .in('workflow_session_id', workflowSessionIds)
        .limit(120);
      if (!byWorkflow.error) {
        for (const r of byWorkflow.data ?? []) {
          mediaRows.push({ ...(r as Row), _source_table: table });
        }
      }
    }
  }

  const uploaderIds = Array.from(new Set(mediaRows.map((p) => str(p.uploaded_by || p.technician_id)).filter(Boolean)));
  const uploaderById = new Map<string, string>();
  if (uploaderIds.length > 0) {
    const profiles = await admin.from('profiles').select('id, full_name, email').in('id', uploaderIds);
    for (const p of profiles.data ?? []) {
      uploaderById.set(str((p as Row).id), str((p as Row).full_name || (p as Row).email) || 'Technician');
    }
  }

  const photos = Array.from(new Map(mediaRows.filter((p) => photoUrl(p)).map((p) => [photoUrl(p), p])).values());
  const fullAddress = [row.service_address, row.service_city, row.service_state, row.service_zip].map(str).filter(Boolean).join(', ');
  const vehicles = vehiclesFromRow(row);
  const vehicleCount = Math.max(vehicles.length, 1);

  const before = photos.filter((p) => resolvePhotoPhase(p) === 'before');
  const after = photos.filter((p) => resolvePhotoPhase(p) === 'after');

  const openTimer = await admin
    .from('tech_job_timers')
    .select('id, started_at, created_at')
    .eq(isFallback ? 'fallback_booking_id' : 'appointment_id', queryId)
    .is('ended_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const [timelineRes, notesRes, outboxRes, agreementRes, paymentsRes] = await Promise.all([
    !isFallback
      ? admin.from('job_timeline_events').select('id, event_type, created_at, created_by, meta').eq('appointment_id', queryId).order('created_at', { ascending: false }).limit(50)
      : Promise.resolve({ data: [] }),
    admin.from('tech_job_notes').select('id, notes, internal_notes, before_notes, after_notes, damage_notes, upsell_notes, vehicle_index, created_at, created_by').eq(isFallback ? 'fallback_booking_id' : 'appointment_id', queryId).order('created_at', { ascending: false }).limit(50),
    admin.from('notification_outbox').select('id, kind, channel, status, skipped_reason, created_at, payload').eq(isFallback ? 'fallback_booking_id' : 'appointment_id', queryId).order('created_at', { ascending: false }).limit(30),
    !isFallback
      ? admin.from('signed_agreements').select('id, signed_at').eq('appointment_id', queryId).order('signed_at', { ascending: false }).limit(1).maybeSingle()
      : admin.from('signed_agreements').select('id, signed_at').eq('fallback_booking_id', queryId).order('signed_at', { ascending: false }).limit(1).maybeSingle(),
    Promise.resolve({ data: [] as Row[] }),
  ]);

  const paymentRowsFetched = await fetchPaymentsForJob(admin, row, {
    appointmentId: !isFallback ? queryId : undefined,
    fallbackBookingId: isFallback ? queryId : undefined,
    isFallback,
  });

  const agreementRow = (agreementRes.data as Row | null) ?? null;
  const agreementSigned = Boolean(agreementRow?.id);
  const agreementCaptureHref = `/tech/work-orders/${encodeURIComponent(id)}/recapture-agreement${shellRole === 'admin' ? '?shell=admin' : ''}`;
  const agreementDetailHref = agreementRow?.id
    ? shellRole === 'admin'
      ? `/admin/agreements/${encodeURIComponent(`signed_agreements:${str(agreementRow.id)}`)}`
      : `/dashboard/agreements/${encodeURIComponent(`signed_agreements:${str(agreementRow.id)}`)}`
    : agreementCaptureHref;

  const paymentRows = paymentRowsFetched;
  const pricing = resolveJobPricing(row, paymentRows);
  await syncJobBalanceDue(admin, row, pricing, {
    appointmentId: !isFallback ? queryId : undefined,
    fallbackBookingId: isFallback ? queryId : undefined,
    isFallback,
  });

  const paymentComplete = pricing.remainingBalanceCents <= 0;

  const guestName = displayText(row.guest_name, resolved.orphanSession ? 'Walk-in customer' : 'Customer');
  const guestPhone = displayPhone(row.guest_phone);
  const guestEmail = displayText(row.guest_email);

  const checklistSaved = ((timelineRes.data ?? []) as Row[]).some((t) => str(t.event_type) === 'checklist_saved');
  const requirements = [
    { label: 'Agreement', ok: agreementSigned },
    { label: 'Before photos', ok: before.length > 0 },
    { label: 'Checklist', ok: checklistSaved },
    { label: 'After photos', ok: after.length > 0 },
    { label: 'Payment', ok: paymentComplete },
  ];

  const canDeletePhotos = isAdminLevel(session.profile?.role ?? null);

  const toGallery = (items: Row[]): WorkOrderGalleryPhoto[] =>
    items.map((p) => ({
      id: str(p.id) || photoUrl(p),
      url: photoUrl(p),
      category: resolvePhotoSlot(p) || 'photo',
      createdAt: str(p.created_at),
      uploader: uploaderById.get(str(p.uploaded_by || p.technician_id)) ?? resolved.technicianName ?? 'Technician',
      table: str(p._source_table) === 'job_media' ? 'job_media' : 'job_photos',
      storagePath: str(p.storage_path) || undefined,
      storageBucket: str(p.storage_bucket) || undefined,
    }));

  const depositPaid = displayMoney(pricing.depositPaidCents || pricing.depositCents);
  const scheduledStart = displayChicago(row.scheduled_start);
  const scheduledEnd = displayChicago(row.estimated_end);
  const accessLocation = displayLabel(row.service_location_type);
  const accessWater = displayLabel(row.water_access);
  const accessPower = displayLabel(row.power_access);
  const accessParking = displayLabel(row.parking_access);
  const gateNotes = displayText(row.gate_access_notes || row.service_address_notes);

  const consoleData: WorkOrderConsoleData = {
    id,
    canonicalId: queryId,
    source: isFallback ? 'fallback' : 'appointment',
    isFallback,
    shellBackHref: shellRole === 'admin' ? '/admin/work-orders' : '/tech',
    guestName,
    guestPhone,
    guestEmail,
    serviceLabel: displayLabel(row.service_slug, 'Service'),
    statusLabel: displayLabel(row.status, 'In progress'),
    fullAddress,
    serviceAddress: str(row.service_address),
    serviceCity: str(row.service_city),
    serviceState: str(row.service_state) || 'TX',
    serviceZip: str(row.service_zip),
    mapsHref: fullAddress ? mapsHref(fullAddress) : '#',
    baseSubtotal: displayMoney(pricing.prePromoCents),
    balanceDue: displayMoney(pricing.remainingBalanceCents),
    balanceDueCents: pricing.remainingBalanceCents,
    depositPaid,
    depositOnFile: displayMoney(pricing.depositCents),
    finalTotal: displayMoney(pricing.finalTotalCents),
    multiCarDiscount: pricing.multiCarDiscountCents > 0 ? displayMoney(pricing.multiCarDiscountCents) : undefined,
    onlineDiscount: pricing.onlineDiscountCents > 0 ? displayMoney(pricing.onlineDiscountCents) : undefined,
    promoDiscount: pricing.promoDiscountCents > 0 ? displayMoney(pricing.promoDiscountCents) : undefined,
    stripePaid: pricing.stripePaidCents > 0 ? displayMoney(pricing.stripePaidCents) : undefined,
    cashPaid: pricing.cashPaidCents > 0 ? displayMoney(pricing.cashPaidCents) : undefined,
    totalPaid: displayMoney(pricing.totalPaidCents),
    paymentMethod: displayLabel(row.payment_choice || row.payment_status, 'Pending'),
    paymentStatus: displayLabel(row.payment_status, 'Pending'),
    scheduledStart,
    scheduledEnd,
    accessLocation,
    accessWater,
    accessPower,
    accessParking,
    gateNotes,
    paymentComplete,
    agreementSigned,
    agreementCaptureHref,
    agreementDetailHref,
    technicianName: resolved.technicianName ?? '',
    jobStartedAt: displayChicago(row.job_started_at, ''),
    jobCompletedAt: displayChicago(row.job_completed_at || row.completed_at, ''),
    requirements,
    timeline: ((timelineRes.data ?? []) as Row[]).map((t) => ({
      id: str(t.id),
      title: displayLabel(t.event_type),
      time: displayChicago(t.created_at),
    })),
    notes: ((notesRes.data ?? []) as Row[]).map((n) => ({
      id: str(n.id),
      vehicleLabel: `Vehicle ${Number(n.vehicle_index ?? -1) >= 0 ? Number(n.vehicle_index) + 1 : 'All'}`,
      time: displayChicago(n.created_at),
      body: [n.internal_notes, n.notes, n.before_notes, n.after_notes, n.damage_notes, n.upsell_notes].map((t) => str(t)).filter(Boolean).join('\n'),
    })),
    outbox: ((outboxRes.data ?? []) as Row[]).map((n) => ({
      id: str(n.id),
      kind: displayLabel(n.kind),
      status: displayLabel(n.status),
      time: displayChicago(n.created_at),
      skipped: str(n.skipped_reason) || undefined,
    })),
    beforePhotos: toGallery(before),
    afterPhotos: toGallery(after),
    canDeletePhotos,
    photosByVehicle: vehicles.map((v, i) => {
      const label = str(v.vehicle_description || v.description) || `Vehicle ${i + 1}`;
      const service = str(v.service_slug || row.service_slug);
      return {
        vehicleIndex: i,
        label,
        service,
        before: toGallery(before.filter((p) => photoVehicleIndex(p, vehicleCount) === i)),
        after: toGallery(after.filter((p) => photoVehicleIndex(p, vehicleCount) === i)),
      };
    }),
    vehicles: vehicles.map((v, i) => {
      const p = vehicleParts(v);
      const vehicleLabel = str(v.vehicle_description || v.description) || `Vehicle ${i + 1}`;
      const priceCents = typeof v.price_cents === 'number' ? v.price_cents : null;
      return {
        year: p.year,
        make: p.make,
        model: p.model,
        description: str(v.vehicle_description || v.description),
        color: str(v.vehicle_color || v.color),
        service: str(v.service_slug || row.service_slug),
        vehicleClass: str(v.vehicle_class || row.vehicle_class),
        label: vehicleLabel,
        partsLine: [p.year, p.make, p.model].filter(Boolean).join(' · '),
        priceCents,
        priceLabel: displayMoney(priceCents, '—'),
      };
    }),
    job: {
      id: queryId,
      status: str(row.status || 'in_progress'),
      service_slug: str(row.service_slug),
      notes: str(row.notes) || null,
      fallback_booking_id: isFallback ? queryId : null,
      workflowSessionId,
      isFallback,
    },
    hasIntake: Boolean(row.intake_completed_at) || isFallback,
    workflowSessionId,
    openTimerId: str((openTimer.data as Row | null)?.id),
    openTimerStartedAt: str((openTimer.data as Row | null)?.started_at || (openTimer.data as Row | null)?.created_at),
    vehicleForms: { defaultService: str(row.service_slug), defaultClass: str(row.vehicle_class) },
    recentPayments: paymentRows.map((p) => ({
      id: str(p.id),
      amount: displayMoney(p.amount_cents),
      status: displayLabel(p.status),
      method: displayLabel(p.payment_method || p.payment_kind),
      at: displayChicago(p.paid_at),
      stripe: str(p.stripe_payment_intent_id) ? 'Stripe' : '',
    })),
    receiptPdfHref: `/api/receipts/${encodeURIComponent(queryId)}/pdf?source=${isFallback ? 'fallback' : 'appointment'}`,
  };

  return (
    <DashboardShell title='Work order' subtitle='Job overview, vehicles, agreement, photos, and payment.' role={shellRole}>
      {partialLoad ? (
        <p className='mb-4 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100'>
          Partial work order data loaded — some fields may be missing until the full record syncs. ID: {id}
        </p>
      ) : null}
      {showDebug ? (
        <WorkOrderDebugPanel
          workOrderId={id}
          canonicalId={queryId}
          source={isFallback ? 'fallback' : 'appointment'}
          appointmentId={!isFallback ? queryId : ''}
          fallbackId={isFallback ? queryId : ''}
          customerId={str(row.customer_id)}
          paymentIds={paymentRows.map((p) => str(p.id)).filter(Boolean)}
          agreementId={str(agreementRow?.id)}
          vehicleCount={vehicles.length}
          photoCount={photos.length}
          workflowSessionIds={workflowSessionIds}
        />
      ) : null}
      <WorkOrderConsoleClient
        data={consoleData}
        updateDetailsAction={updateWorkOrderDetailsAction}
        updateVehiclesAction={updateWorkOrderVehiclesAction}
        recordCashAction={techRecordCashPaymentAction}
        completeJobAction={completeWorkOrderFormAction}
        canAdminOverride={isAdminLevel(session.profile?.role ?? null)}
      />
    </DashboardShell>
  );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[work-order] render failed', { workOrderId: id, role: session.profile?.role, detail, stack: e instanceof Error ? e.stack : undefined });
    return (
      <DashboardShell title='Work order' subtitle='Recoverable error — partial data may be unavailable.' role={shellRole}>
        <WorkOrderErrorCard
          workOrderId={id}
          message='This work order could not be fully loaded. You can retry or return to the list.'
          detail={detail}
          backHref={backHref}
        />
      </DashboardShell>
    );
  }
}
