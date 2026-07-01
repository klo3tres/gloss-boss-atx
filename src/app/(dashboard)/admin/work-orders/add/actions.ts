'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { createAdminJob, type AdminJobStatus, type AdminPaymentStatus } from '@/lib/admin/create-admin-job';

function str(v: FormDataEntryValue | null) {
  return String(v ?? '').trim();
}

function parseJobStatus(v: string): AdminJobStatus {
  if (v === 'completed' || v === 'canceled' || v === 'quote_only') return v;
  return 'scheduled';
}

function parsePaymentStatus(v: string): AdminPaymentStatus {
  if (v === 'deposit_paid' || v === 'paid' || v === 'comped') return v;
  return 'unpaid';
}

export async function createAdminJobAction(formData: FormData) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) {
    redirect('/admin/work-orders/add?error=auth');
  }

  const manualType = str(formData.get('manual_discount_type'));
  const manualValue = Number(str(formData.get('manual_discount_value')) || '0');
  const priceOverride = str(formData.get('price_override'));
  const addOns = str(formData.get('addon_slugs'))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const result = await createAdminJob(admin, {
    customerName: str(formData.get('customer_name')) || 'Customer',
    phone: str(formData.get('phone')),
    email: str(formData.get('email')),
    address: str(formData.get('address')),
    city: str(formData.get('city')) || 'Austin',
    state: str(formData.get('state')) || 'TX',
    zip: str(formData.get('zip')),
    vehicleClass: str(formData.get('vehicle_class')) || 'sedan',
    vehicleYear: str(formData.get('vehicle_year')),
    vehicleMake: str(formData.get('vehicle_make')),
    vehicleModel: str(formData.get('vehicle_model')),
    vehicleDescription: str(formData.get('vehicle_description')),
    serviceSlug: str(formData.get('service_slug')) || 'full-detail',
    addOnSlugs: addOns,
    serviceDate: str(formData.get('service_date')) || new Date().toISOString().slice(0, 10),
    startTime: str(formData.get('start_time')) || '09:00',
    durationMinutes: Number(str(formData.get('duration_minutes')) || '0') || undefined,
    jobStatus: parseJobStatus(str(formData.get('job_status'))),
    paymentStatus: parsePaymentStatus(str(formData.get('payment_status'))),
    promoCode: str(formData.get('promo_code')),
    manualDiscount:
      manualType === 'percent' || manualType === 'dollar'
        ? { type: manualType, value: manualValue, reason: str(formData.get('discount_reason')) }
        : { type: 'none', value: 0 },
    priceOverrideCents: priceOverride ? Math.round(Number(priceOverride) * 100) : null,
    notes: str(formData.get('notes')),
    technicianId: str(formData.get('technician_id')) || null,
    sendCustomerConfirmation: formData.get('send_customer_confirmation') === 'on',
    paymentMethod: str(formData.get('payment_method')) || 'cash',
    createdByUserId: session.user.id,
  });

  if (!result.ok) {
    redirect(`/admin/work-orders/add?error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath('/admin/work-orders');
  revalidatePath('/admin/calendar');
  revalidatePath('/admin/dispatch');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/notifications');

  const gcal =
    result.googleCalendar?.skipped
      ? 'skip'
      : result.googleCalendar?.ok
        ? 'ok'
        : result.googleCalendar
          ? 'fail'
          : '';

  const qs = new URLSearchParams({ shell: 'admin', created: '1' });
  if (gcal) qs.set('gcal', gcal);

  redirect(`/admin/work-orders/${result.appointmentId}?${qs.toString()}`);
}
