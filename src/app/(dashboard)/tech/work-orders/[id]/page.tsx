import { notFound } from 'next/navigation';
import { DashboardShell, type DashboardShellRole } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel, isStaffRole } from '@/lib/auth/roles';
import { buildUnifiedReceiptView } from '@/lib/unified-receipt';
import type { ReceiptParityDebug } from '@/lib/receipt-totals';
import { isTestLikeJob } from '@/lib/tech-job-filters';
import { buildAppointmentScheduleFields } from '@/lib/booking-slot-blocking';
import { totalBookingDurationMinutes } from '@/lib/booking-service-duration';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { syncVehiclesForWorkOrder } from '@/lib/crm-vehicle-sync';
import { syncJobBalanceDue } from '@/lib/job-pricing-display';
import { loadOrderSnapshot } from '@/lib/order-snapshot-engine';
import { resolveOrderLedger } from '@/lib/order-ledger';
import { ledgerReceiptLines } from '@/lib/receipt-from-ledger';
import { fetchPaymentsForJob, fetchUnassignedCustomerPaymentsForDiagnostics } from '@/lib/payments-resolve';
import { calculateLoyaltyStatus } from '@/lib/loyalty-ledger';
import { resolveAgreementSigned } from '@/lib/agreement-signed';
import { resolveWorkOrder, vehicleParts, vehiclesFromRow, type Row } from '@/lib/work-order-resolve';

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
import { displayChicago, displayLabel, displayMoney, displayPhone, displayText, str } from '@/lib/display-format';
import { techCompleteJobAction, techRecordCashPaymentAction, techSaveJobNotesAction } from '../../tech-actions';
import { revalidatePath } from 'next/cache';
import { WorkOrderConsoleClient, type WorkOrderConsoleData } from '@/components/tech/work-order-console-client';
import { WorkOrderErrorCard } from '@/components/tech/work-order-error-card';
import { WorkOrderDebugPanel } from '@/components/tech/work-order-debug-panel';
import type { WorkOrderGalleryPhoto } from '../../work-order-gallery';
import { resolvePhotoPhase, resolvePhotoSlot } from '@/lib/photo-phase';
import { mergePricingBreakdownWithLineItems, readCustomLineItems } from '@/lib/work-order-line-items';
import { resolveJobPricing } from '@/lib/job-pricing-display';
import {
  assessBeforePhotoSlots,
  buildPreInspectionRequirements,
  evaluatePreInspectionStartGate,
  loadPreInspectionDamageAck,
  normalizeBeforeSlot,
  REQUIRED_BEFORE_SLOTS,
  type RequiredBeforeSlot,
} from '@/lib/pre-inspection';

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

import { appleMapsDirectionsUrl, googleMapsDirectionsUrl, googleMapsSearchUrl } from '@/lib/map-links';
import { fetchWeatherForAddress } from '@/lib/weather-forecast';

function mapsHref(address: string) {
  return googleMapsSearchUrl(address);
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
  const recalculateFromCatalog = str(formData.get('recalculateFromCatalog')) === 'true';

  const { data: existing } = await admin
    .from(table)
    .select('scheduled_start, deposit_amount_cents, payment_status, booking_pricing_breakdown, booking_vehicles, custom_line_items, base_price_cents')
    .eq('id', id)
    .maybeSingle();
  const scheduledIso = str((existing as Row | null)?.scheduled_start) || new Date().toISOString();
  const prevBreakdown =
    (existing as Row | null)?.booking_pricing_breakdown && typeof (existing as Row).booking_pricing_breakdown === 'object'
      ? ((existing as Row).booking_pricing_breakdown as Record<string, unknown>)
      : {};
  const prevVehicles = vehiclesFromRow((existing ?? {}) as Row);

  let vehicles: Array<{
    year: string | null;
    make: string | null;
    model: string | null;
    vehicle_description: string;
    vehicle_color: string | null;
    service_slug: string | null;
    vehicle_class: string | null;
    price_cents: number | null;
  }> = [];

  const payloadRaw = str(formData.get('vehiclesPayload'));
  if (payloadRaw) {
    try {
      const parsed = JSON.parse(payloadRaw) as unknown;
      if (Array.isArray(parsed)) {
        vehicles = parsed
          .map((row, index) => {
            const r = row as Record<string, unknown>;
            const year = str(r.year) || null;
            const make = str(r.make) || null;
            const model = str(r.model) || null;
            const description =
              str(r.vehicle_description) || [year, make, model].filter(Boolean).join(' ') || `Vehicle ${index + 1}`;
            const price = Number(r.price_cents);
            return {
              year,
              make,
              model,
              vehicle_description: description,
              vehicle_color: str(r.vehicle_color) || null,
              service_slug: str(r.service_slug) || null,
              vehicle_class: str(r.vehicle_class) || null,
              price_cents: Number.isFinite(price) && price > 0 ? price : null,
            };
          })
          .filter((v) => str(v.vehicle_description));
      }
    } catch {
      /* fall through to legacy fields */
    }
  }

  if (vehicles.length === 0) {
    const descriptions = formData.getAll('vehicleDescription').map((v) => str(v).trim());
    const years = formData.getAll('vehicleYear').map((v) => str(v).trim());
    const makes = formData.getAll('vehicleMake').map((v) => str(v).trim());
    const models = formData.getAll('vehicleModel').map((v) => str(v).trim());
    const colors = formData.getAll('vehicleColor').map((v) => str(v).trim());
    const services = formData.getAll('vehicleService').map((v) => str(v).trim());
    const classes = formData.getAll('vehicleClass').map((v) => str(v).trim());
    const prices = formData.getAll('vehiclePriceCents').map((v) => Number(str(v)) || 0);
    vehicles = descriptions
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
  }

  if (vehicles.length === 0 && prevVehicles.length > 0) {
    return;
  }

  const { mergeVehiclePricingOnSave } = await import('@/lib/historical-pricing');
  const { loadCatalogPriceMap } = await import('@/lib/catalog-price-map');
  const catalogPrices = recalculateFromCatalog ? await loadCatalogPriceMap(admin) : undefined;
  const merged = mergeVehiclePricingOnSave({
    vehicles,
    prevBreakdown,
    prevVehicles,
    recalculateFromCatalog,
    catalogPrices,
  });

  const customItems = readCustomLineItems(existing ?? {});
  const breakdownWithLines = mergePricingBreakdownWithLineItems(
    { booking_pricing_breakdown: merged.breakdownPatch } as Row,
    customItems,
    { ...merged.breakdownPatch },
  );

  const jobDraft = {
    ...(existing ?? {}),
    booking_vehicles: merged.vehicles,
    booking_pricing_breakdown: breakdownWithLines,
  } as Row;
  const payments = await fetchPaymentsForJob(admin, jobDraft, {
    appointmentId: source === 'fallback' ? undefined : id,
    fallbackBookingId: source === 'fallback' ? id : undefined,
    isFallback: source === 'fallback',
  });
  const pricing = resolveJobPricing(jobDraft, payments);

  const patch: Row = {
    booking_vehicles: merged.vehicles,
    vehicle_description: merged.vehicles.map((v) => v.vehicle_description).join(' · '),
    service_slug: merged.vehicles[0]?.service_slug,
    vehicle_class: merged.vehicles[0]?.vehicle_class,
    updated_at: new Date().toISOString(),
    base_price_cents: pricing.finalTotalCents,
    balance_due_cents: pricing.remainingBalanceCents,
    booking_pricing_breakdown: mergePricingBreakdownWithLineItems(jobDraft, customItems, {
      ...breakdownWithLines,
      finalTotalCents: pricing.finalTotalCents,
      vehicleSubtotalCents: pricing.vehicleSubtotalCents,
      customLineItemsCents: pricing.customLineItemsCents,
    }),
  };

  const scheduleLines = merged.vehicles.map((v) => ({
    serviceSlug: str(v.service_slug) || 'exterior-wash',
    vehicleClass: str(v.vehicle_class) || 'sedan',
  }));
  Object.assign(patch, buildAppointmentScheduleFields(scheduledIso, scheduleLines));
  patch.estimated_duration_minutes = totalBookingDurationMinutes(scheduleLines);

  await admin.from(table).update(patch).eq('id', id);
  await syncJobBalanceDue(admin, { ...(existing ?? {}), ...patch } as Row, pricing, {
    appointmentId: source === 'fallback' ? undefined : id,
    fallbackBookingId: source === 'fallback' ? id : undefined,
    isFallback: source === 'fallback',
  });

  const { generateWorkOrderReceiptActionState } = await import('@/app/(dashboard)/tech/work-order-payment-actions');
  const rebuildFd = new FormData();
  rebuildFd.set('source', source);
  if (source === 'fallback') rebuildFd.set('fallbackBookingId', id);
  else rebuildFd.set('appointmentId', id);
  await generateWorkOrderReceiptActionState(null, rebuildFd);

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
  const unassignedPaymentDiagnostics = await fetchUnassignedCustomerPaymentsForDiagnostics(admin, row, {
    appointmentId: !isFallback ? queryId : undefined,
    fallbackBookingId: isFallback ? queryId : undefined,
    isFallback,
  });

  const agreementRow = (agreementRes.data as Row | null) ?? null;
  const agreementSigned =
    Boolean(agreementRow?.id) || (await resolveAgreementSigned(admin, queryId, isFallback, row));
  const agreementCaptureHref = `/tech/work-orders/${encodeURIComponent(id)}/recapture-agreement${shellRole === 'admin' ? '?shell=admin' : ''}`;
  const agreementDetailHref = agreementRow?.id
    ? shellRole === 'admin'
      ? `/admin/agreements/${encodeURIComponent(`signed_agreements:${str(agreementRow.id)}`)}`
      : `/dashboard/agreements/${encodeURIComponent(`signed_agreements:${str(agreementRow.id)}`)}`
    : agreementCaptureHref;

  const paymentRows = paymentRowsFetched;
  const orderSnapshot = await loadOrderSnapshot(admin, {
    workOrderId: queryId,
    appointmentId: !isFallback ? queryId : undefined,
    fallbackBookingId: isFallback ? queryId : undefined,
    sourceHint: isFallback ? 'fallback' : 'appointment',
  });
  const orderLedger = await resolveOrderLedger(admin, {
    workOrderId: queryId,
    appointmentId: !isFallback ? queryId : undefined,
    fallbackBookingId: isFallback ? queryId : undefined,
    sourceHint: isFallback ? 'fallback' : 'appointment',
  });
  const pricing = orderLedger?._pricing ?? orderSnapshot?.pricing ?? resolveJobPricing(row, paymentRows);
  const ledgerResolveError = orderLedger
    ? null
    : 'Order ledger could not be resolved. Receipt preview, PDF, and customer email are blocked until this is fixed.';
  const receiptBreakdownLines = orderLedger ? ledgerReceiptLines(orderLedger, { includeAdmin: true }) : [];

  let receiptParityDebug: ReceiptParityDebug | undefined;
  if (orderLedger && isAdminLevel(session.profile?.role ?? null)) {
    try {
      const unified = await buildUnifiedReceiptView(admin, {
        job: row,
        appointmentId: !isFallback ? queryId : undefined,
        fallbackBookingId: isFallback ? queryId : undefined,
      });
      receiptParityDebug = unified.parity;
    } catch {
      receiptParityDebug = undefined;
    }
  }
  const ledgerWarnings = orderLedger?.warnings ?? [];
  const ledgerTotals = orderLedger
    ? {
        serviceSubtotal: displayMoney(orderLedger.totals.serviceSubtotalCents),
        addOnSubtotal: displayMoney(orderLedger.totals.addOnSubtotalCents),
        grossSubtotal: displayMoney(orderLedger.totals.grossSubtotalCents),
        totalDiscounts: displayMoney(orderLedger.totals.totalDiscountCents),
        finalTotal: displayMoney(orderLedger.totals.finalTotalCents),
        totalPaid: displayMoney(orderLedger.totals.totalPaidCents),
        balanceDue: displayMoney(orderLedger.totals.balanceDueCents),
      }
    : undefined;
  const orderSourceMap: Record<string, string> = {
    online_booking: 'Online booking',
    admin_work_order: 'Admin work order',
    walk_in: 'Walk-in / tech',
  };
  const orderSourceLabel = orderLedger
    ? `${orderSourceMap[orderLedger.audit.orderSource] ?? orderLedger.audit.bookingSource}${orderLedger.audit.pricingLocked ? ' · Booked prices locked' : ''}`
    : displayLabel(str(row.booking_source), 'Work order');
  const ledgerDiscounts =
    orderLedger?.discounts.map((d) => ({
      id: d.id,
      label: d.label,
      amount: displayMoney(d.amountCents),
      source: d.source,
    })) ?? [];
  const ledgerPayments =
    orderLedger?.payments.map((p) => ({
      id: p.id,
      label: p.label,
      amount: displayMoney(p.amountCents),
      amountCents: p.amountCents,
      status: displayLabel(p.status),
      bucket: p.bucket,
      voided: p.voided,
    })) ?? paymentRows.map((p) => ({
      id: str(p.id),
      label: displayLabel(p.payment_method || p.payment_kind, 'Payment'),
      amount: displayMoney(p.amount_cents),
      status: displayLabel(p.status),
      bucket: 'other',
      voided: Boolean(p.voided_at || p.voided === true),
    }));
  const photoUploadDisabled = resolved.orphanSession || isTestLikeJob(row);
  const photoUploadDisableReason = resolved.orphanSession
    ? 'Orphan session — link a live appointment before uploading.'
    : isTestLikeJob(row)
      ? 'Test/archived job — photo upload disabled.'
      : null;
  const canManagePayments = isStaffRole(session.profile?.role ?? null);
  const workOrderPath = `/tech/work-orders/${encodeURIComponent(id)}${shellRole === 'admin' ? '?shell=admin' : ''}`;
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
  const jobStarted = str(row.status) === 'in_progress' || Boolean(row.job_started_at);
  const preInspectionOverridden = Boolean(str(row.pre_inspection_override_reason));
  const damageAckRow = await loadPreInspectionDamageAck(admin, {
    appointmentId: !isFallback ? queryId : undefined,
    fallbackBookingId: isFallback ? queryId : undefined,
    vehicleIndex: 0,
  });
  const beforeSlotAssessment = assessBeforePhotoSlots(before, row.service_slug as string | null | undefined);
  const slotFilled = Object.fromEntries(
    REQUIRED_BEFORE_SLOTS.map((s) => [s, beforeSlotAssessment.filled.has(s)]),
  ) as Record<RequiredBeforeSlot, boolean>;
  const beforePhotosBySlot: Partial<
    Record<
      RequiredBeforeSlot,
      { id: string; url: string; table?: 'job_media' | 'job_photos'; storagePath?: string; storageBucket?: string }
    >
  > = {};
  for (const p of before) {
    const slot = normalizeBeforeSlot(resolvePhotoSlot(p as Record<string, unknown>)) as RequiredBeforeSlot;
    if (!(REQUIRED_BEFORE_SLOTS as readonly string[]).includes(slot)) continue;
    beforePhotosBySlot[slot] = {
      id: str(p.id) || photoUrl(p),
      url: photoUrl(p),
      table: str(p._source_table) === 'job_media' ? 'job_media' : 'job_photos',
      storagePath: str(p.storage_path) || undefined,
      storageBucket: str(p.storage_bucket) || undefined,
    };
  }
  const startGate = evaluatePreInspectionStartGate({
    photos: before,
    damageAck: damageAckRow,
    agreementSigned,
    preInspectionOverridden,
    serviceSlug: row.service_slug as string | null | undefined,
  });
  const requirements = buildPreInspectionRequirements({
    agreementSigned,
    photoProgress: beforeSlotAssessment.count + '/' + beforeSlotAssessment.total,
    photosComplete: beforeSlotAssessment.missing.length === 0,
    damageAckComplete: startGate.damageAckComplete,
    checklistSaved,
    afterPhotosOk: after.length > 0,
    paymentComplete,
    jobStarted,
    preInspectionOverridden,
  });
  const primaryVehicle = vehicles[0];
  const primaryVehicleLabel =
    str(primaryVehicle?.vehicle_description || primaryVehicle?.description) || 'Vehicle 1';

  const canDeletePhotos = isAdminLevel(session.profile?.role ?? null);

  const toGallery = (items: Row[]): WorkOrderGalleryPhoto[] =>
    items.map((p) => ({
      id: str(p.id) || photoUrl(p),
      url: photoUrl(p),
      category: resolvePhotoSlot(p) || 'photo',
      phase: resolvePhotoPhase(p),
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

  const customLineItems = readCustomLineItems(row).map((item) => ({
    id: item.id,
    label: item.label,
    kind: item.kind,
    amountCents: item.amountCents,
    quantity: item.quantity,
    notes: item.notes,
  }));

  let stampsCount = 0;
  let stampsList: any[] = [];
  let creditsList: any[] = [];
  let redemptionsList: any[] = [];
  if (row.customer_id) {
    const [stampsRes, creditsRes, redemptionsRes] = await Promise.all([
      admin
        .from('loyalty_stamps')
        .select('id, stamp_count, reason, created_at, appointment_id, voided, voided_at, voided_by, source')
        .eq('customer_id', row.customer_id)
        .order('created_at', { ascending: false }),
      admin
        .from('customer_credits')
        .select('*, profiles(full_name)')
        .eq('customer_id', row.customer_id)
        .order('issued_at', { ascending: false }),
      admin
        .from('customer_credit_redemptions')
        .select('*, profiles(full_name), customer_credits!inner(customer_id), payments(appointment_id, fallback_booking_id)')
        .eq('customer_credits.customer_id', row.customer_id)
        .order('redeemed_at', { ascending: false }),
    ]);
    
    stampsList = stampsRes.data ?? [];
    stampsCount = calculateLoyaltyStatus(stampsList).totalStamps;

    creditsList = (creditsRes.data ?? []).map((c: any) => ({
      id: c.id,
      amount_cents: c.amount_cents,
      remaining_cents: c.remaining_cents,
      type: c.type,
      reason: c.reason,
      status: c.status,
      issued_at: c.issued_at,
      expires_at: c.expires_at,
      linked_work_order_id: c.linked_work_order_id,
      linked_payment_id: c.linked_payment_id,
      issued_by_name: c.profiles?.full_name || 'Staff',
    }));

    redemptionsList = (redemptionsRes.data ?? []).map((r: any) => ({
      id: r.id,
      credit_id: r.credit_id,
      payment_id: r.payment_id,
      amount_cents: r.amount_cents,
      redeemed_at: r.redeemed_at,
      redeemed_by_name: r.profiles?.full_name || 'Staff',
      appointment_id: r.payments?.appointment_id,
      fallback_booking_id: r.payments?.fallback_booking_id,
    }));
  }

  const weather = fullAddress
    ? await fetchWeatherForAddress(fullAddress, str(row.scheduled_start) || undefined)
    : { ok: false as const, blocker: 'No address for weather lookup.' };

  const consoleData: any = {
    id,
    canonicalId: queryId,
    customerId: str(row.customer_id) || undefined,
    loyaltyStampsCount: stampsCount,
    loyaltyStamps: stampsList,
    credits: creditsList,
    redemptions: redemptionsList,
    customLineItems,
    jobPricing: pricing,
    pricingSnapshot: {
      vehicleSubtotalCents: pricing.vehicleSubtotalCents,
      addOnSubtotalCents: pricing.addOnSubtotalCents,
      multiCarDiscountCents: pricing.multiCarDiscountCents,
      onlineDiscountCents: pricing.onlineDiscountCents,
      promoDiscountCents: pricing.promoDiscountCents,
      manualDiscountCents: pricing.manualDiscountCents,
      customLineItemsCents: pricing.customLineItemsCents,
      finalTotalCents: pricing.finalTotalCents,
      depositPaidCents: pricing.depositPaidCents,
      totalPaidCents: pricing.totalPaidCents,
      rawTotalPaidCents: pricing.rawTotalPaidCents,
      overpaymentCents: pricing.overpaymentCents,
      remainingBalanceCents: pricing.remainingBalanceCents,
    },
    receiptBreakdownLines,
    ledgerResolveError,
    receiptParityDebug,
    ledgerDiscounts,
    ledgerPayments,
    ledgerWarnings,
    ledgerTotals,
    orderSourceLabel,
    isTestOrder: isTestLikeJob(row),
    stripeSessionId: str(row.stripe_checkout_session_id || row.final_payment_checkout_session_id),
    stripePaymentIntent: str(row.stripe_payment_intent_id),
    canAdvancedRepair: isAdminLevel(session.profile?.role ?? null),
    photoUploadDisabled,
    photoUploadDisableReason: photoUploadDisableReason ?? undefined,
    photoUploadResolvedContext: !photoUploadDisabled,
    uploadContextDebug: showDebug
      ? {
          workOrderId: queryId,
          appointmentId: !isFallback ? queryId : '',
          fallbackBookingId: isFallback ? queryId : '',
          workflowSessionId: workflowSessionId ?? '',
          customerId: str(row.customer_id),
          urlParamId: id,
          source: isFallback ? 'fallback' : 'appointment',
          uploadEnabled: !photoUploadDisabled,
          disableReason: photoUploadDisableReason ?? '',
          partialLoad: Boolean(partialLoad),
        }
      : undefined,
    canManagePayments,
    workOrderPath,
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
    googleDirectionsHref: fullAddress ? googleMapsDirectionsUrl(fullAddress) : '',
    appleMapsHref: fullAddress ? appleMapsDirectionsUrl(fullAddress) : '',
    weather,
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
    totalPaid: pricing.hasOverpayment
      ? `${displayMoney(pricing.rawTotalPaidCents)} (${displayMoney(pricing.allocatedTotalPaidCents)} applied)`
      : displayMoney(pricing.totalPaidCents),
    paymentMethod: displayLabel(row.payment_choice || row.payment_status, 'Pending'),
    paymentStatus: displayLabel(row.payment_status, 'Pending'),
    scheduledStart,
    scheduledEnd,
    scheduledStartIso: str(row.scheduled_start),
    promoCode: str(row.promo_code),
    pricingOverrideReason: str(
      (row.booking_pricing_breakdown && typeof row.booking_pricing_breakdown === 'object'
        ? (row.booking_pricing_breakdown as Record<string, unknown>).adminOverrideReason
        : '') as string,
    ),
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
        vehicleClass: str(v.vehicle_class || row.vehicle_class) || 'sedan',
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
    preInspection: {
      photoProgress: startGate.photoProgress,
      slotFilled,
      beforePhotosBySlot,
      canDeletePhotos,
      missingStartItems: startGate.missingItems,
      canStartJob: startGate.canStart,
      isJobStarted: jobStarted,
      preInspectionOverridden,
      damageAck: {
        damageNotes: str(damageAckRow?.damage_notes),
        noVisibleDamage: Boolean(damageAckRow?.no_visible_damage),
        customerAcknowledged: Boolean(damageAckRow?.customer_acknowledged),
        customerSignatureName: str(damageAckRow?.customer_signature_name),
        witnessName: str(damageAckRow?.witness_name),
        acknowledgedAt: damageAckRow?.acknowledged_at ? displayChicago(damageAckRow.acknowledged_at) : '',
        damageAckComplete: startGate.damageAckComplete,
      },
      vehicleIndex: 0,
      vehicleLabel: primaryVehicleLabel,
      serviceSlug: str(row.service_slug),
      technicianName: resolved.technicianName ?? 'Technician',
    },
    recentPayments: paymentRows.map((p) => ({
      id: str(p.id),
      amount: displayMoney(p.amount_cents),
      amountCents: num(p.amount_cents),
      status: displayLabel(p.status),
      method: displayLabel(p.payment_method || p.payment_kind),
      at: displayChicago(p.paid_at),
      voided: Boolean(p.voided_at || p.voided === true) || str(p.status).toLowerCase() === 'voided',
      stripe: str(p.stripe_payment_intent_id) ? 'Stripe' : '',
    })),
    unassignedPaymentDiagnostics: unassignedPaymentDiagnostics.map((p) => ({
      id: str(p.id),
      amount: displayMoney(p.amount_cents),
      amountCents: num(p.amount_cents),
      status: displayLabel(p.status),
      method: displayLabel(p.payment_method || p.payment_kind),
      source: displayLabel(
        (p.metadata && typeof p.metadata === 'object' ? (p.metadata as Row).source : '') || p.provider || p.payment_kind,
        'Payment',
      ),
      appointmentId: str(p.appointment_id),
      fallbackBookingId: str(p.fallback_booking_id),
      customerId: str(p.customer_id),
      stripeSession: str(p.stripe_checkout_session_id),
      stripeIntent: str(p.stripe_payment_intent_id),
      at: displayChicago(p.paid_at || p.created_at),
    })),
    receiptPdfHref: `/api/receipts/${encodeURIComponent(queryId)}/pdf?source=${isFallback ? 'fallback' : 'appointment'}`,
  };

  return (
    <DashboardShell title='Work order' subtitle='Job overview, vehicles, agreement, photos, and payment.' role={shellRole}>
      {showDebug ? (
        <div className='mb-6 space-y-4'>
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
        </div>
      ) : null}
      <WorkOrderConsoleClient
        data={consoleData}
        updateDetailsAction={updateWorkOrderDetailsAction}
        updateVehiclesAction={updateWorkOrderVehiclesAction}
        recordCashAction={techRecordCashPaymentAction}
        completeJobAction={completeWorkOrderFormAction}
        canAdminOverride={isAdminLevel(session.profile?.role ?? null)}
        canEditPricing={isAdminLevel(session.profile?.role ?? null)}
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
