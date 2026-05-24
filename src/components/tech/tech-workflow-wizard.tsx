'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { techSearchCustomersAction } from '@/app/(dashboard)/tech/tech-customer-search-actions';
import { techCompleteJobAction, techStartJobAction } from '@/app/(dashboard)/tech/tech-actions';
import { techCreateWalkInJobAction, techSignWalkInAgreementAction } from '@/app/(dashboard)/tech/tech-workflow-actions';
import { normalizeVehicleClass, UI_VEHICLE_CLASSES, uiVehicleLabel, type UiVehicleClass } from '@/lib/vehicle-pricing';
import { buildNativeAgreementSnapshot, DEFAULT_AGREEMENT_TITLE } from '@/lib/default-gloss-boss-agreement';

type CatalogService = { id: string; slug: string; title: string; subtitle: string | null; sort_order: number };
type PriceRow = { service_id: string; vehicle_class: string; price_cents: number };
type AddonOpt = { slug: string; label: string; price_cents: number };

const STEPS = 9;
const WALKIN_STORAGE_KEY = 'glossboss_tech_walkin_v1';
const PHOTO_CATEGORIES = [
  { value: 'front', label: 'Front' },
  { value: 'rear', label: 'Rear' },
  { value: 'driver_side', label: 'Driver side' },
  { value: 'passenger_side', label: 'Passenger side' },
  { value: 'interior', label: 'Interior' },
  { value: 'wheels', label: 'Wheels' },
  { value: 'damage', label: 'Damage' },
  { value: 'other', label: 'Other' },
] as const;
type PhotoCategory = (typeof PHOTO_CATEGORIES)[number]['value'];
type PhotoPreview = { src: string; uploadedAt: string; savedTo?: string; label?: string };
type UploadedPhotoProof = {
  uploadedProof: true;
  category: string;
  photoCategory?: string | null;
  url?: string | null;
  path?: string | null;
  mediaId?: string | null;
  photoId?: string | null;
  uploadedAt: string;
  appointmentId?: string | null;
  fallbackBookingId?: string | null;
  workflowSessionId?: string | null;
  savedTo?: string | null;
};
type StoredWalkInJob = {
  appointmentId?: string | null;
  fallbackBookingId?: string | null;
  accessToken?: string | null;
  jobReference?: string | null;
  workflowSessionId?: string | null;
  lockedTotalCents?: number | null;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  customerId?: string | null;
  vehicleClass?: UiVehicleClass;
  vehicleDescription?: string;
  serviceId?: string | null;
  serviceSlug?: string | null;
  uploadedPhotoProof?: UploadedPhotoProof[];
  savedAt?: number;
};

function pickLineCents(prices: PriceRow[], serviceId: string, vehicleClass: UiVehicleClass): number | null {
  const row = prices.find((p) => p.service_id === serviceId && p.vehicle_class === vehicleClass);
  if (!row || typeof row.price_cents !== 'number' || row.price_cents <= 0) return null;
  return row.price_cents;
}

function addonSumCents(addons: AddonOpt[], slugs: Set<string>): number {
  let s = 0;
  for (const a of addons) {
    if (slugs.has(a.slug)) s += a.price_cents;
  }
  return s;
}

function readStoredWalkInJob(): StoredWalkInJob | null {
  try {
    const raw = sessionStorage.getItem(WALKIN_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as StoredWalkInJob;
    if (typeof o.savedAt !== 'number') return null;
    if (Date.now() - o.savedAt > 36 * 3600000) {
      sessionStorage.removeItem(WALKIN_STORAGE_KEY);
      return null;
    }
    return o;
  } catch {
    return null;
  }
}

function formatPhoneDisplay(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 10);
  if (d.length !== 10) return input.trim() || '—';
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

function formatRoleLabel(role: string | null | undefined): string {
  const r = (role ?? '').replace(/_/g, ' ').trim();
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : 'Technician';
}

function isQualifyingBeforePhotoCategory(cat: PhotoCategory): boolean {
  return cat !== 'damage' && cat !== 'other';
}

function isQualifyingBeforeCategoryValue(value: string | null | undefined): boolean {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ['before', 'front', 'rear', 'driver_side', 'passenger_side', 'interior', 'wheels', 'inspection'].includes(normalized);
}

function photoCategoryLabel(value: PhotoCategory): string {
  return PHOTO_CATEGORIES.find((cat) => cat.value === value)?.label ?? value.replace(/_/g, ' ');
}

export function TechWorkflowWizard({
  witness,
}: {
  witness?: { id: string | null; name: string; role: string | null };
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, startTransition] = useTransition();

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchRows, setSearchRows] = useState<{ id: string; email: string; full_name: string | null; phone: string | null }[]>([]);

  const [vehicleClass, setVehicleClass] = useState<UiVehicleClass>('sedan');
  const [vehicleDescription, setVehicleDescription] = useState('');

  const [services, setServices] = useState<CatalogService[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [serviceId, setServiceId] = useState<string | null>(null);

  const [addons, setAddons] = useState<AddonOpt[]>([]);
  const [addonSlugs, setAddonSlugs] = useState<Set<string>>(new Set());

  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [fallbackBookingId, setFallbackBookingId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [workflowSessionId, setWorkflowSessionId] = useState<string | null>(null);
  const [lockedTotalCents, setLockedTotalCents] = useState<number | null>(null);

  const [signerName, setSignerName] = useState('');
  const [agreementAck, setAgreementAck] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [beforePreviews, setBeforePreviews] = useState<PhotoPreview[]>([]);
  const [afterPreviews, setAfterPreviews] = useState<PhotoPreview[]>([]);
  const [beforePreviewByCategory, setBeforePreviewByCategory] = useState<Record<string, PhotoPreview[]>>({});
  const [afterPreviewByCategory, setAfterPreviewByCategory] = useState<Record<string, PhotoPreview[]>>({});
  const [uploadedPhotoProof, setUploadedPhotoProof] = useState<UploadedPhotoProof[]>([]);
  const [beforeCount, setBeforeCount] = useState(0);
  const [afterCount, setAfterCount] = useState(0);
  const [timerStarted, setTimerStarted] = useState(false);
  const [timerError, setTimerError] = useState<string | null>(null);
  const [timerId, setTimerId] = useState<string | null>(null);
  const [checklistText, setChecklistText] = useState('Walk-around inspection\nPre-wash photos\nInterior protection\nFinal QC');
  const [beforeNotes, setBeforeNotes] = useState('');
  const [afterNotes, setAfterNotes] = useState('');
  const [damageNotes, setDamageNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [upsellNotes, setUpsellNotes] = useState('');
  const [customerVisibleNotes, setCustomerVisibleNotes] = useState(false);
  const [noDamageObserved, setNoDamageObserved] = useState(false);
  const [notesSavedAt, setNotesSavedAt] = useState<string | null>(null);
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const o = readStoredWalkInJob();
    if (!o) return;
    setAppointmentId((prev) => prev ?? o.appointmentId ?? null);
    setFallbackBookingId((prev) => prev ?? o.fallbackBookingId ?? null);
    setAccessToken((prev) => prev ?? o.accessToken ?? null);
    setWorkflowSessionId((prev) => prev ?? o.workflowSessionId ?? null);
    if (typeof o.lockedTotalCents === 'number') {
      setLockedTotalCents((prev) => (prev != null ? prev : o.lockedTotalCents ?? null));
    }
    if (Array.isArray(o.uploadedPhotoProof)) {
      setUploadedPhotoProof(o.uploadedPhotoProof);
      const proofCount = o.uploadedPhotoProof.filter((p) => isQualifyingBeforeCategoryValue(p.photoCategory ?? p.category)).length;
      if (proofCount > 0) setBeforeCount((prev) => Math.max(prev, proofCount));
    }
  }, []);

  const persistWalkInJob = useCallback(
    (patch: Partial<StoredWalkInJob>) => {
      const next: StoredWalkInJob = {
        ...(readStoredWalkInJob() ?? {}),
        appointmentId,
        fallbackBookingId,
        accessToken,
        workflowSessionId,
        lockedTotalCents,
        guestName,
        guestEmail,
        guestPhone,
        customerId,
        vehicleClass,
        vehicleDescription,
        serviceId,
        serviceSlug: services.find((s) => s.id === serviceId)?.slug ?? null,
        ...patch,
        savedAt: Date.now(),
      };
      try {
        sessionStorage.setItem(WALKIN_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      console.info('[tech-workflow] persisted job reference', {
        step,
        appointmentId: next.appointmentId ?? null,
        fallbackBookingId: next.fallbackBookingId ?? null,
        accessToken: next.accessToken ? `${next.accessToken.slice(0, 8)}...` : null,
      });
      return next;
    },
    [
      accessToken,
      appointmentId,
      customerId,
      fallbackBookingId,
      guestEmail,
      guestName,
      guestPhone,
      lockedTotalCents,
      serviceId,
      services,
      step,
      vehicleClass,
      vehicleDescription,
      workflowSessionId,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/services', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { services?: CatalogService[]; prices?: PriceRow[] }) => {
        if (cancelled) return;
        const sv = Array.isArray(j.services) ? j.services : [];
        const pr = Array.isArray(j.prices) ? j.prices : [];
        setServices(sv);
        setPrices(pr);
        setServiceId((prev) => {
          if (prev) return prev;
          const first = sv.find((s) => s.slug !== 'ceramic-coating') ?? sv[0];
          return first?.id ?? null;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/public/addons', { cache: 'no-store' })
      .then((r) => r.json())
      .then(
        (j: {
          addons?: { slug?: string | null; label?: string | null; name?: string | null; price_cents?: number | null }[];
        }) => {
          if (cancelled) return;
          const raw = j.addons ?? [];
          setAddons(
            raw.map((a) => ({
              slug: String(a.slug ?? '').trim(),
              label: String(a.label ?? a.name ?? a.slug ?? '').trim() || String(a.slug),
              price_cents: typeof a.price_cents === 'number' ? a.price_cents : 0,
            })).filter((a) => a.slug),
          );
        },
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedService = useMemo(() => services.find((s) => s.id === serviceId) ?? null, [services, serviceId]);

  const estimatedLineCents = useMemo(() => {
    if (!serviceId) return null;
    return pickLineCents(prices, serviceId, vehicleClass);
  }, [prices, serviceId, vehicleClass]);

  const estimatedAddonCents = useMemo(() => addonSumCents(addons, addonSlugs), [addons, addonSlugs]);

  const estimatedTotalCents = useMemo(() => {
    if (estimatedLineCents == null) return null;
    return estimatedLineCents + estimatedAddonCents;
  }, [estimatedLineCents, estimatedAddonCents]);

  const walkInAgreementPreview = useMemo(() => {
    if (!selectedService) return '';
    const line = lockedTotalCents ?? estimatedTotalCents ?? estimatedLineCents ?? 0;
    const classLabel = uiVehicleLabel(vehicleClass);
    return buildNativeAgreementSnapshot({
      customerName: guestName.trim() || 'Customer',
      customerEmail: guestEmail.trim(),
      customerPhone: formatPhoneDisplay(guestPhone),
      vehicleDescription: vehicleDescription.trim() || '—',
      serviceLabel: selectedService.title || selectedService.slug.replace(/-/g, ' '),
      vehicleClassLabel: classLabel,
      totalDollars: (line / 100).toFixed(2),
      depositNote: 'Walk-in field job — deposit $0 unless collected separately.',
      technicianName: witness?.name ? `${witness.name} (${formatRoleLabel(witness.role)})` : null,
    });
  }, [
    selectedService,
    lockedTotalCents,
    estimatedTotalCents,
    estimatedLineCents,
    vehicleClass,
    guestName,
    guestEmail,
    guestPhone,
    vehicleDescription,
    witness?.name,
    witness?.role,
  ]);

  const runSearch = useCallback(() => {
    startTransition(() => {
      void techSearchCustomersAction(searchQ).then((r) => {
        if (r.ok) setSearchRows(r.rows);
      });
    });
  }, [searchQ]);

  const selectCustomer = (row: { id: string; email: string; full_name: string | null; phone: string | null }) => {
    setCustomerId(row.id);
    setGuestEmail(row.email);
    setGuestName(row.full_name ?? '');
    setGuestPhone(row.phone ?? '');
    setSearchRows([]);
    setSearchQ('');
  };

  const clearCustomer = () => {
    setCustomerId(null);
  };

  const toggleAddon = (slug: string) => {
    setAddonSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const goNext = () => setStep((s) => Math.min(STEPS, s + 1));
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const canProceed1 = guestName.trim().length > 1 && guestEmail.includes('@') && guestPhone.replace(/\D/g, '').length >= 10;

  const canProceed2 = vehicleDescription.trim().length > 3;

  const ceramicNeedsQuote = selectedService?.slug === 'ceramic-coating' && estimatedLineCents == null;
  const canProceed3 = Boolean(selectedService && !ceramicNeedsQuote && estimatedLineCents != null);

  const createJob = () => {
    if (!selectedService || estimatedLineCents == null) {
      setError(
        selectedService?.slug === 'ceramic-coating'
          ? 'Ceramic coating is set to Quote — add sedan/SUV prices in Admin → Services & pricing first, or choose another package.'
          : 'Choose a priced service.',
      );
      return;
    }
    setError(null);
    startTransition(() => {
      void techCreateWalkInJobAction({
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim(),
        guestPhone: guestPhone.trim(),
        customerId,
        vehicles: [
          {
            serviceSlug: selectedService.slug,
            vehicleClass: normalizeVehicleClass(vehicleClass),
            vehicleDescription: vehicleDescription.trim(),
          },
        ],
        addOns: Array.from(addonSlugs),
        notes: 'Tech workflow walk-in',
      }).then((r) => {
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setAppointmentId(r.appointmentId);
        setFallbackBookingId(r.fallbackBookingId ?? null);
        setAccessToken(r.accessToken);
        setWorkflowSessionId(r.workflowSessionId ?? null);
        setLockedTotalCents(r.totalCents);
        persistWalkInJob({
          appointmentId: r.appointmentId,
          fallbackBookingId: r.fallbackBookingId ?? null,
          accessToken: r.accessToken,
          jobReference: r.appointmentId ?? r.fallbackBookingId ?? r.accessToken,
          workflowSessionId: r.workflowSessionId ?? null,
          lockedTotalCents: r.totalCents,
        });
        setSignerName(guestName.trim());
        goNext();
      });
    });
  };

  const signAgreement = () => {
    if (!appointmentId && fallbackBookingId) {
      if (!agreementAck) {
        setError('Review the acknowledgement and check the box to continue.');
        return;
      }
      setError(null);
      persistWalkInJob({ fallbackBookingId, accessToken, jobReference: fallbackBookingId });
      startTransition(() => {
        void techSignWalkInAgreementAction({
          appointmentId: null,
          fallbackBookingId,
          signerLegalName: signerName.trim() || guestName.trim() || 'Walk-in customer',
          signatureType: 'typed',
          signatureData: signerName.trim() || guestName.trim() || null,
          smsConsent,
          technicianWitnessName: witness?.name ?? null,
          technicianWitnessRole: witness?.role ?? null,
        }).then((r) => {
          if (!r.ok) {
            setError(r.error);
            return;
          }
          persistWalkInJob({ fallbackBookingId, accessToken, jobReference: fallbackBookingId });
          goNext();
        });
      });
      return;
    }
    if (!appointmentId) return;
    if (!agreementAck) {
      setError('Review the acknowledgement and check the box to continue.');
      return;
    }
    setError(null);
    startTransition(() => {
      void techSignWalkInAgreementAction({
        appointmentId,
        fallbackBookingId,
        signerLegalName: signerName.trim(),
        signatureType: 'typed',
        signatureData: signerName.trim(),
        smsConsent,
        technicianWitnessName: witness?.name ?? null,
        technicianWitnessRole: witness?.role ?? null,
      }).then((r) => {
        if (!r.ok) {
          setError(r.error);
          return;
        }
        persistWalkInJob({ appointmentId, fallbackBookingId, accessToken, jobReference: appointmentId });
        goNext();
      });
    });
  };

  const uploadPhoto = (file: File | null, photoCat: PhotoCategory, phase: 'before' | 'after') => {
    if (!file) return;
    const stored = readStoredWalkInJob();
    const activeAppointmentId = appointmentId ?? stored?.appointmentId ?? null;
    const activeFallbackBookingId = fallbackBookingId ?? stored?.fallbackBookingId ?? null;
    const activeAccessToken = accessToken ?? stored?.accessToken ?? null;
    const activeWorkflowSessionId = workflowSessionId ?? stored?.workflowSessionId ?? null;
    const activeJobReference = activeAppointmentId ?? activeFallbackBookingId ?? stored?.jobReference ?? activeAccessToken ?? null;
    console.info('[tech-workflow] upload refs', {
      step,
      appointmentId,
      fallbackBookingId,
      sessionStorage: {
        appointmentId: stored?.appointmentId ?? null,
        fallbackBookingId: stored?.fallbackBookingId ?? null,
        accessToken: stored?.accessToken ? `${stored.accessToken.slice(0, 8)}...` : null,
        workflowSessionId: stored?.workflowSessionId ?? null,
      },
      selectedJobReference: activeJobReference,
    });
    if (activeAppointmentId && !appointmentId) setAppointmentId(activeAppointmentId);
    if (activeFallbackBookingId && !fallbackBookingId) setFallbackBookingId(activeFallbackBookingId);
    if (activeAccessToken && !accessToken) setAccessToken(activeAccessToken);
    if (activeWorkflowSessionId && !workflowSessionId) setWorkflowSessionId(activeWorkflowSessionId);
    const fd = new FormData();
    fd.set('currentStep', String(step));
    if (activeAppointmentId) fd.set('appointmentId', activeAppointmentId);
    if (activeFallbackBookingId) fd.set('fallbackBookingId', activeFallbackBookingId);
    if (activeAccessToken) fd.set('accessToken', activeAccessToken);
    if (activeWorkflowSessionId) fd.set('techWorkflowSessionId', activeWorkflowSessionId);
    if (activeJobReference) fd.set('jobReference', activeJobReference);
    if (activeFallbackBookingId) fd.set('techWorkflowId', activeFallbackBookingId);
    fd.set('customerName', guestName.trim() || stored?.guestName || '');
    fd.set('customerPhone', guestPhone.trim() || stored?.guestPhone || '');
    fd.set('vehicleSummary', vehicleDescription.trim() || stored?.vehicleDescription || '');
    fd.set('serviceSlug', selectedService?.slug ?? stored?.serviceSlug ?? '');
    if (customerId ?? stored?.customerId) fd.set('customerId', customerId ?? stored?.customerId ?? '');
    fd.set('walkInMode', 'true');
    fd.set('category', phase);
    fd.set('photoCategory', photoCat);
    fd.set('file', file);
    startTransition(() => {
      void fetch('/api/tech/job-media-upload', {
        method: 'POST',
        body: fd,
      }).then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          url?: string;
          error?: string;
          category?: string;
          photoCategory?: string;
          savedTo?: string;
          appointmentId?: string | null;
          fallbackBookingId?: string | null;
          workflowSessionId?: string | null;
          mediaId?: string | null;
          photoId?: string | null;
          uploadedProof?: boolean;
          path?: string | null;
          uploadedAt?: string;
        };
        if (!res.ok || !j.ok) {
          setError(j.error ?? 'Photo upload failed.');
          return;
        }
        const preview: PhotoPreview = {
          src: URL.createObjectURL(file),
          uploadedAt: j.uploadedAt ?? new Date().toISOString(),
          savedTo: j.savedTo,
          label: photoCategoryLabel(photoCat),
        };
        const proof: UploadedPhotoProof = {
          uploadedProof: true,
          category: j.category ?? phase,
          photoCategory: j.photoCategory ?? photoCat,
          url: j.url ?? null,
          path: j.path ?? null,
          mediaId: j.mediaId ?? null,
          photoId: j.photoId ?? null,
          uploadedAt: j.uploadedAt ?? new Date().toISOString(),
          appointmentId: j.appointmentId ?? activeAppointmentId ?? null,
          fallbackBookingId: j.fallbackBookingId ?? activeFallbackBookingId ?? null,
          workflowSessionId: j.workflowSessionId ?? activeWorkflowSessionId ?? null,
          savedTo: j.savedTo ?? null,
        };
        const storedProof = (readStoredWalkInJob()?.uploadedPhotoProof ?? []).filter((p) => p.url !== proof.url && p.path !== proof.path);
        const nextProof = [proof, ...storedProof].slice(0, 30);
        setUploadedPhotoProof(nextProof);
        persistWalkInJob({ uploadedPhotoProof: nextProof, workflowSessionId: proof.workflowSessionId ?? activeWorkflowSessionId });
        if (j.appointmentId) {
          setAppointmentId(j.appointmentId);
          persistWalkInJob({ appointmentId: j.appointmentId, fallbackBookingId: j.fallbackBookingId ?? null, workflowSessionId: proof.workflowSessionId ?? null, jobReference: j.appointmentId, uploadedPhotoProof: nextProof });
        } else if (j.fallbackBookingId) {
          setFallbackBookingId(j.fallbackBookingId);
          persistWalkInJob({ fallbackBookingId: j.fallbackBookingId, workflowSessionId: proof.workflowSessionId ?? null, jobReference: j.fallbackBookingId, uploadedPhotoProof: nextProof });
        }
        if (phase === 'after') {
          setAfterCount((c) => c + 1);
          setAfterPreviews((p) => [preview, ...p].slice(0, 8));
          setAfterPreviewByCategory((prev) => ({ ...prev, [photoCat]: [preview, ...(prev[photoCat] ?? [])].slice(0, 4) }));
        } else {
          if (isQualifyingBeforePhotoCategory(photoCat)) setBeforeCount((c) => c + 1);
          setBeforePreviews((p) => [preview, ...p].slice(0, 8));
          setBeforePreviewByCategory((prev) => ({ ...prev, [photoCat]: [preview, ...(prev[photoCat] ?? [])].slice(0, 4) }));
        }
        setError(null);
      });
    });
  };

  const startJob = async () => {
    if (!appointmentId && !fallbackBookingId) return;
    setTimerError(null);
    if (!appointmentId && fallbackBookingId) {
      const res = await fetch('/api/tech/job-timer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          appointmentId: appointmentId ?? undefined,
          fallbackBookingId: fallbackBookingId ?? undefined,
          workflowSessionId: workflowSessionId ?? undefined,
          label: 'Walk-in workflow',
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTimerError(typeof j.error === 'string' ? j.error : 'Could not start timer');
        return;
      }
      setTimerStarted(true);
      if (typeof j.id === 'string') setTimerId(j.id);
      router.push('/tech?jobStarted=1');
      return;
    }
    const activeAppointmentId = appointmentId;
    if (!activeAppointmentId) return;
    const fd = new FormData();
    fd.set('appointmentId', activeAppointmentId);
    if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
    if (workflowSessionId) fd.set('workflowSessionId', workflowSessionId);
    if (accessToken) fd.set('accessToken', accessToken);
    fd.set('jobReference', activeAppointmentId);
    const storedProof = readStoredWalkInJob()?.uploadedPhotoProof ?? [];
    const proofForStart =
      uploadedPhotoProof.length > 0
        ? uploadedPhotoProof
        : storedProof.length > 0
          ? storedProof
          : beforeCount > 0 || beforePreviews.length > 0
            ? [{
                uploadedProof: true as const,
                category: 'before',
                photoCategory: 'before',
                uploadedAt: new Date().toISOString(),
                appointmentId: activeAppointmentId,
                fallbackBookingId,
                workflowSessionId,
                savedTo: fallbackBookingId ? 'fallback' : 'appointment',
              }]
            : [];
    fd.set('uploadedPhotoProof', JSON.stringify(proofForStart));
    const started = await techStartJobAction(null, fd);
    if (started?.error) {
      setTimerError(started.error);
      return;
    }
    setTimerStarted(true);
    router.push('/tech?jobStarted=1');
  };

  const saveWorkflowNotes = () => {
    if (!appointmentId && !fallbackBookingId) return;
    startTransition(() => {
      void fetch('/api/tech/job-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: appointmentId ?? undefined,
          fallbackBookingId: fallbackBookingId ?? undefined,
          checklist: checklistText.split('\n').map((s) => s.trim()).filter(Boolean),
          beforeNotes,
          afterNotes,
          damageNotes,
          internalNotes,
          upsellSuggestions: upsellNotes,
          customerVisible: customerVisibleNotes,
          noDamageObserved,
        }),
      }).then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          setError(j.error ?? 'Could not save notes.');
          return;
        }
        setError(null);
        setNotesSavedAt(new Date().toISOString());
      });
    });
  };

  const completeJob = () => {
    if (!appointmentId) {
      setError('Fallback workflow saved. Convert the fallback to an appointment from Dispatch before completing.');
      return;
    }
    startTransition(() => {
      saveWorkflowNotes();
      const fd = new FormData();
      fd.set('appointmentId', appointmentId);
      if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
      if (workflowSessionId) fd.set('workflowSessionId', workflowSessionId);
      if (accessToken) fd.set('accessToken', accessToken);
      fd.set('jobReference', appointmentId);
      if (noDamageObserved) fd.set('noDamageObserved', 'true');
      void techCompleteJobAction(null, fd).then((r) => {
        if (r?.error) {
          setError(r.error);
          return;
        }
        setCompletionMessage('Job completed. Payment and receipt options are ready.');
      });
    });
  };

  const createPayNow = async () => {
    if (!appointmentId) {
      setPaymentMessage('Payment links require an appointment. Convert this fallback first.');
      return;
    }
    setPaymentMessage(null);
    const res = await fetch('/api/tech/final-balance-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string; code?: string };
    if (!res.ok || !j.ok || !j.url) {
      setPaymentMessage(j.error ?? 'Payment link unavailable.');
      return;
    }
    setPaymentUrl(j.url);
    window.open(j.url, '_blank', 'noopener,noreferrer');
  };

  const storedDebug = step === 7 ? readStoredWalkInJob() : null;
  const jobReference = appointmentId ?? fallbackBookingId ?? accessToken ?? workflowSessionId ?? storedDebug?.jobReference ?? null;

  return (
    <div className='tech-workflow-form mx-auto w-full max-w-2xl space-y-8 px-3 pb-24 sm:px-0'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='text-[10px] font-black uppercase tracking-[0.3em] text-gold-soft'>
          Step {step} / {STEPS}
        </p>
        <Link href='/tech' className='text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-gold-soft'>
          Exit to dashboard
        </Link>
      </div>

      <div className='h-1.5 overflow-hidden rounded-full bg-zinc-800'>
        <div
          className='h-full bg-gradient-to-r from-gold/80 to-amber-400 transition-all duration-500'
          style={{ width: `${(step / STEPS) * 100}%` }}
        />
      </div>

      {error ? (
        <p className='rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200' role='alert'>
          {error}
        </p>
      ) : null}
      {timerError ? (
        <p className='rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100' role='alert'>
          {timerError}
        </p>
      ) : null}
      {jobReference ? (
        <p className='rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-2 text-xs text-emerald-200'>
          Workflow job saved: {appointmentId ? 'appointment' : fallbackBookingId ? 'fallback' : workflowSessionId ? 'session' : 'reference'}{' '}
          <span className='font-mono'>{jobReference.slice(0, 8)}…</span>
        </p>
      ) : null}

      {step === 1 ? (
        <section className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/90 p-6'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>1 · Customer</h2>
          <p className='text-sm text-zinc-400'>Search an existing customer or enter details for a new profile.</p>
          <div className='flex flex-wrap gap-2'>
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder='Search name, email, phone'
              className='min-w-[200px] flex-1 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
            <button
              type='button'
              disabled={busy || searchQ.trim().length < 2}
              onClick={runSearch}
              className='rounded-lg border border-gold/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gold-soft disabled:opacity-40'
            >
              Search
            </button>
          </div>
          {customerId ? (
            <p className='text-xs text-emerald-300'>
              Linked customer record ·{' '}
              <button type='button' onClick={clearCustomer} className='underline'>
                clear
              </button>
            </p>
          ) : null}
          {searchRows.length > 0 ? (
            <ul className='max-h-48 space-y-1 overflow-auto rounded-lg border border-white/10 bg-black/40 p-2 text-sm'>
              {searchRows.map((r) => (
                <li key={r.id}>
                  <button
                    type='button'
                    onClick={() => selectCustomer(r)}
                    className='w-full rounded px-2 py-1.5 text-left hover:bg-white/5'
                  >
                    <span className='font-semibold text-white'>{r.full_name ?? r.email}</span>
                    <span className='block text-xs text-zinc-500'>{r.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <label className='block text-xs text-zinc-400'>
            Full name
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
          <label className='block text-xs text-zinc-400'>
            Email
            <input
              type='email'
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
          <label className='block text-xs text-zinc-400'>
            Phone
            <input
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
          <div className='flex justify-end'>
            <button
              type='button'
              disabled={!canProceed1}
              onClick={goNext}
              className='rounded-lg bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/90 p-6'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>2 · Vehicle</h2>
          <label className='block text-xs text-zinc-400'>
            Vehicle class
            <select
              value={vehicleClass}
              onChange={(e) => setVehicleClass(e.target.value as UiVehicleClass)}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            >
              {UI_VEHICLE_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c === 'sedan' ? 'Sedan' : 'SUV / Truck'}
                </option>
              ))}
            </select>
          </label>
          <label className='block text-xs text-zinc-400'>
            Year, make, model &amp; color (or VIN notes)
            <textarea
              value={vehicleDescription}
              onChange={(e) => setVehicleDescription(e.target.value)}
              rows={3}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
          <div className='flex justify-between gap-2'>
            <button type='button' onClick={goBack} className='text-xs font-bold uppercase tracking-wider text-zinc-500'>
              Back
            </button>
            <button
              type='button'
              disabled={!canProceed2}
              onClick={goNext}
              className='rounded-lg bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/90 p-6'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>3 · Service</h2>
          {services.length === 0 ? (
            <p className='text-sm text-zinc-500'>Loading catalog…</p>
          ) : (
            <ul className='space-y-2'>
              {services.map((s) => {
                const cents = pickLineCents(prices, s.id, vehicleClass);
                const disabled = cents == null;
                return (
                  <li key={s.id}>
                    <button
                      type='button'
                      disabled={disabled}
                      onClick={() => setServiceId(s.id)}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                        serviceId === s.id ? 'border-gold bg-gold/10' : 'border-white/10 bg-black/40 hover:border-gold/30'
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      <span className='font-bold text-white'>{s.title}</span>
                      <span className='block text-xs text-zinc-500'>{s.subtitle}</span>
                      <span className='mt-1 block text-xs text-gold-soft'>
                        {disabled ? 'Quote — set price in Admin → Services' : `$${(cents / 100).toFixed(0)} (${vehicleClass.replace('_', ' ')})`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className='flex justify-between gap-2'>
            <button type='button' onClick={goBack} className='text-xs font-bold uppercase tracking-wider text-zinc-500'>
              Back
            </button>
            <button
              type='button'
              disabled={!canProceed3}
              onClick={goNext}
              className='rounded-lg bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/90 p-6'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>4 · Add-ons</h2>
          {addons.length === 0 ? (
            <p className='text-sm text-zinc-500'>No active add-ons in catalog.</p>
          ) : (
            <ul className='space-y-2'>
              {addons.map((a) => (
                <li key={a.slug}>
                  <label className='flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3'>
                    <input
                      type='checkbox'
                      checked={addonSlugs.has(a.slug)}
                      onChange={() => toggleAddon(a.slug)}
                      className='rounded border-zinc-600'
                    />
                    <span className='flex-1 text-sm text-zinc-200'>
                      {a.label}{' '}
                      <span className='text-gold-soft'>(+${(a.price_cents / 100).toFixed(0)})</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className='flex justify-between gap-2'>
            <button type='button' onClick={goBack} className='text-xs font-bold uppercase tracking-wider text-zinc-500'>
              Back
            </button>
            <button
              type='button'
              onClick={goNext}
              className='rounded-lg bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black'
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 5 ? (
        <section className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/90 p-6'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>5 · Quote total</h2>
          <div className='rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-zinc-300'>
            <p>
              <span className='text-zinc-500'>Service:</span> {selectedService?.title ?? '—'}
            </p>
            <p>
              <span className='text-zinc-500'>Vehicle:</span> {vehicleDescription}
            </p>
            <p>
              <span className='text-zinc-500'>Line:</span>{' '}
              {estimatedLineCents != null ? `$${(estimatedLineCents / 100).toFixed(2)}` : '—'}
            </p>
            <p>
              <span className='text-zinc-500'>Add-ons:</span> ${(estimatedAddonCents / 100).toFixed(2)}
            </p>
            <p className='mt-3 text-lg font-black text-white'>
              Estimated total:{' '}
              {estimatedTotalCents != null ? `$${(estimatedTotalCents / 100).toFixed(2)}` : 'Unavailable'}
            </p>
            <p className='mt-2 text-xs text-zinc-500'>
              Creates a walk-in job assigned to you (not the public booking funnel). Final total is computed server-side with your live
              pricing rules.
            </p>
          </div>
          <div className='flex justify-between gap-2'>
            <button type='button' onClick={goBack} className='text-xs font-bold uppercase tracking-wider text-zinc-500'>
              Back
            </button>
            <button
              type='button'
              disabled={busy || estimatedTotalCents == null}
              onClick={createJob}
              className='rounded-lg bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
            >
              {busy ? 'Creating…' : 'Create job & continue'}
            </button>
          </div>
        </section>
      ) : null}

      {step === 6 ? (
        <section className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/90 p-6'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>6 · Acknowledgement</h2>
          <p className='text-sm text-zinc-400'>
            Review the Gloss Boss ATX acknowledgement below. The customer must provide their full legal name; a drawn signature is optional.
          </p>
          {!appointmentId && !fallbackBookingId ? (
            <p className='rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100'>
              No job is linked to this step. Go back to <strong>5 · Quote total</strong> and tap <strong>Create job & continue</strong>. If you
              already created the job this session, refresh the page — your job id is restored automatically when possible.
            </p>
          ) : fallbackBookingId && !appointmentId ? (
            <>
              <p className='rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100'>
                Appointment insert fell back to a review row. This workflow will keep saving photos, timer, and notes against fallback{' '}
                <span className='font-mono'>{fallbackBookingId.slice(0, 8)}…</span> until Dispatch converts it.
              </p>
              <label className='flex items-start gap-2 text-sm text-zinc-300'>
                <input
                  type='checkbox'
                  checked={agreementAck}
                  onChange={(e) => setAgreementAck(e.target.checked)}
                  className='mt-1 h-4 w-4 rounded border-zinc-600 bg-black'
                />
                <span>Customer reviewed the acknowledgement and authorized the fallback field workflow.</span>
              </label>
              <label className='flex items-start gap-2 text-sm text-zinc-300'>
                <input
                  type='checkbox'
                  checked={smsConsent}
                  onChange={(e) => setSmsConsent(e.target.checked)}
                  className='mt-1 h-4 w-4 rounded border-zinc-600 bg-black'
                />
                <span>
                  I agree to receive SMS service updates from Gloss Boss ATX about this appointment. Message/data rates may apply. Reply STOP to opt out.
                </span>
              </label>
              <div className='flex justify-between gap-2'>
                <button type='button' onClick={goBack} className='text-xs font-bold uppercase tracking-wider text-zinc-500'>
                  Back
                </button>
                <button
                  type='button'
                  disabled={busy || !agreementAck}
                  onClick={signAgreement}
                  className='rounded-lg bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
                >
                  Continue with fallback
                </button>
              </div>
            </>
          ) : (
            <>
              <article className='max-h-[min(60vh,32rem)] overflow-y-auto rounded-sm border border-zinc-200/90 bg-white p-5 text-zinc-900 shadow-[0_0_0_1px_rgba(212,175,55,0.25),0_12px_40px_rgba(0,0,0,0.35)] sm:p-8'>
                <header className='border-b border-amber-600/30 pb-4'>
                  <p className='text-[10px] font-black uppercase tracking-[0.28em] text-amber-700'>Gloss Boss ATX</p>
                  <h3 className='mt-2 font-serif text-lg font-bold text-black sm:text-xl'>{DEFAULT_AGREEMENT_TITLE}</h3>
                  {lockedTotalCents != null ? (
                    <p className='mt-2 text-sm text-zinc-600'>
                      Agreed job total: <span className='font-semibold text-black'>${(lockedTotalCents / 100).toFixed(2)}</span>
                      <span className='text-zinc-400'> · Ref. {appointmentId ? appointmentId.slice(0, 8) : 'fallback'}…</span>
                    </p>
                  ) : null}
                </header>
                <pre className='mt-5 whitespace-pre-wrap font-serif text-[13px] leading-relaxed text-zinc-800 sm:text-[14px]'>
                  {walkInAgreementPreview}
                </pre>
              </article>
              <label className='flex items-start gap-2 text-sm text-zinc-300'>
                <input
                  type='checkbox'
                  checked={agreementAck}
                  onChange={(e) => setAgreementAck(e.target.checked)}
                  className='mt-1 h-4 w-4 rounded border-zinc-600 bg-black'
                />
                <span>
                  Customer has read the acknowledgement and agrees to its terms. I confirm the information above matches this job.
                </span>
              </label>
              <label className='flex items-start gap-2 text-sm text-zinc-300'>
                <input
                  type='checkbox'
                  checked={smsConsent}
                  onChange={(e) => setSmsConsent(e.target.checked)}
                  className='mt-1 h-4 w-4 rounded border-zinc-600 bg-black'
                />
                <span>
                  I agree to receive SMS service updates from Gloss Boss ATX about this appointment. Message/data rates may apply. Reply STOP to opt out.
                </span>
              </label>
              <label className='block text-xs text-zinc-400'>
                Signer legal name (must match ID)
                <input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
                />
              </label>
              <div className='flex justify-between gap-2'>
                <button type='button' onClick={goBack} className='text-xs font-bold uppercase tracking-wider text-zinc-500'>
                  Back
                </button>
                <button
                  type='button'
                  disabled={busy || signerName.trim().length < 2 || !agreementAck}
                  onClick={signAgreement}
                  className='rounded-lg bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
                >
                  {busy ? 'Saving…' : 'Accept & record signature'}
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}

      {step === 7 ? (
        <section className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/90 p-6'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>7 · Before photos</h2>
          <p className='text-sm text-zinc-400'>Upload photos from your phone or computer. JPEG, PNG, and WEBP are supported.</p>
          <div className={`rounded-xl border p-3 text-xs ${beforeCount > 0 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-100'}`}>
            <p className='font-black uppercase tracking-wider'>
              {beforeCount > 0 ? 'Before photo requirement met' : 'At least one vehicle photo required before starting'}
            </p>
            <p className='mt-1'>Uploaded qualifying before/inspection photos this session: {beforeCount}</p>
          </div>
          <label className='flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-100'>
            <input type='checkbox' checked={noDamageObserved} onChange={(e) => setNoDamageObserved(e.target.checked)} />
            No visible damage observed
          </label>
          <details className='rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-zinc-400'>
            <summary className='cursor-pointer font-bold uppercase tracking-wider text-gold-soft'>Workflow debug</summary>
            <dl className='mt-3 grid gap-1 font-mono text-[11px]'>
              <div>appointmentId: {appointmentId ? `${appointmentId.slice(0, 8)}...` : 'none'}</div>
              <div>fallbackBookingId: {fallbackBookingId ? `${fallbackBookingId.slice(0, 8)}...` : 'none'}</div>
              <div>accessToken: {accessToken ? `${accessToken.slice(0, 8)}...` : 'none'}</div>
              <div>workflowSessionId: {workflowSessionId ? `${workflowSessionId.slice(0, 8)}...` : 'none'}</div>
              <div>jobReference: {jobReference ? `${jobReference.slice(0, 8)}...` : 'none'}</div>
              <div>sessionStorage: {storedDebug ? 'present' : 'missing'}</div>
            </dl>
          </details>
          <div className='grid gap-3 sm:grid-cols-2'>
            {PHOTO_CATEGORIES.map((cat) => (
              <label
                key={cat.value}
                className='block cursor-pointer rounded-xl border border-white/10 bg-black/35 p-3 text-xs text-zinc-300 transition hover:border-gold/35 hover:bg-gold/5'
              >
                <span className='font-black uppercase tracking-wider text-gold-soft'>{cat.label}</span>
                <span className='mt-1 block text-[10px] text-zinc-500'>Tap to take or upload photo.</span>
                <input
                  type='file'
                  accept='image/*'
                  capture='environment'
                  onChange={(e) => {
                    uploadPhoto(e.target.files?.[0] ?? null, cat.value, 'before');
                    e.currentTarget.value = '';
                  }}
                  className='sr-only'
                />
                {beforePreviewByCategory[cat.value]?.length ? (
                  <div className='mt-3 grid grid-cols-3 gap-2'>
                    {beforePreviewByCategory[cat.value].map((src) => (
                      <div key={src.src} className='space-y-1'>
                        <img src={src.src} alt={`${cat.label} before upload preview`} className='aspect-square rounded-lg border border-white/10 object-cover' />
                        <p className='text-[9px] font-bold uppercase tracking-wider text-zinc-300'>{src.label ?? cat.label}</p>
                        <p className='text-[9px] text-emerald-300'>Uploaded {new Date(src.uploadedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                        {src.savedTo === 'fallback' ? <p className='text-[9px] text-amber-200'>Saved to fallback job record</p> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </label>
            ))}
          </div>
          {beforePreviews.length > 0 ? (
            <div className='grid grid-cols-3 gap-2'>
              {beforePreviews.map((src) => (
                <img key={src.src} src={src.src} alt='Uploaded job preview' className='aspect-square rounded-lg border border-white/10 object-cover' />
              ))}
            </div>
          ) : null}
          <div className='flex justify-between gap-2'>
            <button type='button' onClick={goBack} className='text-xs font-bold uppercase tracking-wider text-zinc-500'>
              Back
            </button>
            <button
              type='button'
              disabled={beforeCount < 1}
              onClick={goNext}
              className='rounded-lg bg-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 8 ? (
        <section className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/90 p-6'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>8 · Start Job</h2>
          <p className='text-sm text-zinc-400'>Review the work order, then start the job and timer in one tap.</p>
          <div className='grid gap-3 rounded-2xl border border-white/10 bg-black/35 p-4 text-sm text-zinc-300 sm:grid-cols-2'>
            <div>
              <p className='text-[10px] font-black uppercase tracking-wider text-zinc-500'>Customer</p>
              <p className='font-semibold text-white'>{guestName || 'Walk-in customer'}</p>
              <p className='text-xs text-zinc-500'>{formatPhoneDisplay(guestPhone)}</p>
            </div>
            <div>
              <p className='text-[10px] font-black uppercase tracking-wider text-zinc-500'>Vehicle</p>
              <p className='font-semibold text-white'>{vehicleDescription || 'Vehicle pending'}</p>
              <p className='text-xs text-zinc-500'>{uiVehicleLabel(vehicleClass)}</p>
            </div>
            <div>
              <p className='text-[10px] font-black uppercase tracking-wider text-zinc-500'>Service</p>
              <p className='font-semibold text-white'>{selectedService?.title ?? selectedService?.slug ?? 'Service'}</p>
              <p className='text-xs text-zinc-500'>
                {Array.from(addonSlugs).length ? `Add-ons: ${Array.from(addonSlugs).join(', ')}` : 'No add-ons selected'}
              </p>
            </div>
            <div>
              <p className='text-[10px] font-black uppercase tracking-wider text-zinc-500'>Closeout checks</p>
              <p className='font-semibold text-white'>${((lockedTotalCents ?? estimatedTotalCents ?? 0) / 100).toFixed(2)}</p>
              <p className='text-xs text-zinc-500'>
                Agreement {agreementAck ? 'captured' : 'pending'} · Before photos {beforeCount > 0 ? `${beforeCount} uploaded` : 'needed'}
              </p>
            </div>
          </div>
          <div className='flex flex-wrap justify-between gap-2'>
            <button type='button' onClick={goBack} className='text-xs font-bold uppercase tracking-wider text-zinc-500'>
              Back
            </button>
            {timerStarted ? (
              <button type='button' onClick={goNext} className='rounded-lg bg-gold px-5 py-2.5 text-xs font-black uppercase text-black'>
                Continue
              </button>
            ) : (
              <button
                type='button'
                onClick={() => void startJob()}
                className='rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white'
              >
                Start Job & Timer
              </button>
            )}
          </div>
        </section>
      ) : null}

      {step === 9 ? (
        <section className='space-y-4 rounded-2xl border border-gold/20 bg-zinc-950/90 p-6'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>9 · Active Job / Complete Job</h2>
          <p className='text-sm text-zinc-400'>Track the running job, save closeout notes, add at least one after photo, then complete service.</p>
          {!timerStarted ? (
            <p className='text-sm text-amber-200'>Start the timer on the previous step before marking this job in progress.</p>
          ) : null}
          {timerId ? <p className='text-xs text-emerald-300'>Timer running · {timerId.slice(0, 8)}…</p> : null}
          {notesSavedAt ? (
            <p className='rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-200'>
              Notes saved at {new Date(notesSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </p>
          ) : null}
          {completionMessage ? (
            <p className='rounded-lg border border-gold/30 bg-gold/10 p-2 text-xs text-gold-soft'>{completionMessage}</p>
          ) : null}
          {paymentMessage ? (
            <p className='rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100'>{paymentMessage}</p>
          ) : null}
          {paymentUrl ? (
            <a href={paymentUrl} target='_blank' rel='noreferrer' className='inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white'>
              Open customer payment link
            </a>
          ) : null}
          <label className='block text-xs text-zinc-400'>
            Checklist (one item per line)
            <textarea
              value={checklistText}
              onChange={(e) => setChecklistText(e.target.value)}
              rows={4}
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 font-mono text-xs text-white'
            />
          </label>
          <div className='grid gap-3 sm:grid-cols-2'>
            <label className='block text-xs text-zinc-400'>
              Before notes
              <textarea value={beforeNotes} onChange={(e) => setBeforeNotes(e.target.value)} rows={3} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
            </label>
            <label className='block text-xs text-zinc-400'>
              After notes
              <textarea value={afterNotes} onChange={(e) => setAfterNotes(e.target.value)} rows={3} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
            </label>
            <label className='block text-xs text-rose-300/90'>
              Damage notes
              <textarea value={damageNotes} onChange={(e) => setDamageNotes(e.target.value)} rows={3} className='mt-1 w-full rounded-lg border border-rose-900/40 bg-black px-3 py-2 text-sm text-white' />
            </label>
            <label className='block text-xs text-amber-200/90'>
              Internal notes
              <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={3} className='mt-1 w-full rounded-lg border border-amber-900/40 bg-black px-3 py-2 text-sm text-white' />
            </label>
          </div>
          <label className='block text-xs text-zinc-400'>
            Upsell notes
            <textarea value={upsellNotes} onChange={(e) => setUpsellNotes(e.target.value)} rows={2} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          </label>
          <label className='flex items-center gap-2 text-xs text-zinc-400'>
            <input type='checkbox' checked={customerVisibleNotes} onChange={(e) => setCustomerVisibleNotes(e.target.checked)} />
            Mark non-internal notes customer-visible
          </label>
          <label className='flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-100'>
            <input type='checkbox' checked={noDamageObserved} onChange={(e) => setNoDamageObserved(e.target.checked)} />
            No damage observed
          </label>
          <div className='rounded-xl border border-white/10 bg-black/30 p-3'>
            <p className='text-xs font-bold uppercase tracking-wider text-gold-soft'>After photos ({afterCount})</p>
            <div className='mt-3 grid gap-3 sm:grid-cols-2'>
              {PHOTO_CATEGORIES.map((cat) => (
                <label
                  key={cat.value}
                  className='block cursor-pointer rounded-xl border border-white/10 bg-black/35 p-3 text-xs text-zinc-300 transition hover:border-gold/35 hover:bg-gold/5'
                >
                  <span className='font-black uppercase tracking-wider text-gold-soft'>{cat.label}</span>
                  <span className='mt-1 block text-[10px] text-zinc-500'>Tap to take or upload photo.</span>
                  <input
                    type='file'
                    accept='image/*'
                    capture='environment'
                    onChange={(e) => {
                      uploadPhoto(e.target.files?.[0] ?? null, cat.value, 'after');
                      e.currentTarget.value = '';
                    }}
                    className='sr-only'
                  />
                  {afterPreviewByCategory[cat.value]?.length ? (
                    <div className='mt-3 grid grid-cols-3 gap-2'>
                      {afterPreviewByCategory[cat.value].map((src) => (
                        <div key={src.src} className='space-y-1'>
                          <img src={src.src} alt={`${cat.label} after upload preview`} className='aspect-square rounded-lg border border-white/10 object-cover' />
                          <p className='text-[9px] font-bold uppercase tracking-wider text-zinc-300'>{src.label ?? cat.label}</p>
                          <p className='text-[9px] text-emerald-300'>Uploaded {new Date(src.uploadedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                          {src.savedTo === 'fallback' ? <p className='text-[9px] text-amber-200'>Saved to fallback job record</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </label>
              ))}
            </div>
            {afterPreviews.length > 0 ? (
              <div className='mt-3 grid grid-cols-3 gap-2'>
                {afterPreviews.map((src) => (
                  <img key={src.src} src={src.src} alt='Uploaded after preview' className='aspect-square rounded-lg border border-white/10 object-cover' />
                ))}
              </div>
            ) : null}
          </div>
          <div className='flex justify-between gap-2'>
            <button type='button' onClick={goBack} className='text-xs font-bold uppercase tracking-wider text-zinc-500'>
              Back
            </button>
            <button
              type='button'
              disabled={busy}
              onClick={saveWorkflowNotes}
              className='rounded-lg border border-gold/40 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-gold-soft disabled:opacity-40'
            >
              Save notes
            </button>
            <button
              type='button'
              disabled={busy || !timerStarted}
              onClick={completeJob}
              className='rounded-lg bg-gold px-6 py-3 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40'
            >
              {busy ? 'Saving…' : appointmentId ? 'Complete job' : 'Save fallback'}
            </button>
            <button
              type='button'
              disabled={busy || !appointmentId}
              onClick={() => void createPayNow()}
              className='rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-40'
            >
              Customer Pay Now
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
