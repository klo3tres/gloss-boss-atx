'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import {
  createAdminJob,
  type AdminJobStatus,
  type AdminPaymentStatus,
  type CreateAdminJobResult,
} from '@/lib/admin/create-admin-job';

function str(v: FormDataEntryValue | null) {
  return String(v ?? '').trim();
}

function parseJobStatus(v: string): AdminJobStatus {
  if (v === 'completed' || v === 'canceled' || v === 'quote_only') return v;
  return 'scheduled';
}

function parsePaymentStatus(v: string): AdminPaymentStatus {
  if (
    v === 'pay_later' ||
    v === 'deposit_paid' ||
    v === 'deposit_required' ||
    v === 'paid' ||
    v === 'comped' ||
    v === 'custom_manual'
  ) {
    return v;
  }
  if (v === 'unpaid') return 'pay_later';
  return 'pay_later';
}

export async function createAdminJobAction(formData: FormData): Promise<CreateAdminJobResult> {
  try {
    const session = await getSessionWithProfile();
    const admin = tryCreateAdminSupabase();

    if (!session.user || !isAdminLevel(session.profile?.role ?? null)) {
      return {
        success: false,
        errors: ['You must be signed in as an admin to add jobs.'],
        warnings: [],
      };
    }

    if (!admin) {
      return {
        success: false,
        errors: [
          'Server database access is not configured. Add SUPABASE_SERVICE_ROLE_KEY to your environment (Vercel → Settings → Environment Variables).',
        ],
        warnings: [],
      };
    }

    const manualType = str(formData.get('manual_discount_type'));
    const manualValue = Number(str(formData.get('manual_discount_value')) || '0');
    const priceOverride = str(formData.get('price_override'));
    const addOns = str(formData.get('addon_slugs'))
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const customerName = str(formData.get('customer_name'));
    const phone = str(formData.get('phone'));
    const address = str(formData.get('address'));
    const serviceSlug = str(formData.get('service_slug'));

    if (!customerName) {
      return { success: false, errors: ['Customer name is required.'], warnings: [] };
    }
    if (!phone) {
      return { success: false, errors: ['Customer phone is required.'], warnings: [] };
    }
    if (!address) {
      return { success: false, errors: ['Service address is required.'], warnings: [] };
    }
    if (!serviceSlug) {
      return { success: false, errors: ['Service package is required.'], warnings: [] };
    }

    const result = await createAdminJob(admin, {
      customerName,
      phone,
      email: str(formData.get('email')),
      address,
      city: str(formData.get('city')) || 'Austin',
      state: str(formData.get('state')) || 'TX',
      zip: str(formData.get('zip')),
      vehicleClass: str(formData.get('vehicle_class')) || 'sedan',
      vehicleYear: str(formData.get('vehicle_year')),
      vehicleMake: str(formData.get('vehicle_make')),
      vehicleModel: str(formData.get('vehicle_model')),
      vehicleDescription: str(formData.get('vehicle_description')),
      serviceSlug,
      addOnSlugs: addOns,
      serviceDate: str(formData.get('service_date')) || new Date().toISOString().slice(0, 10),
      startTime: str(formData.get('start_time')) || '09:00',
      durationMinutes: Number(str(formData.get('duration_minutes')) || '0') || undefined,
      jobStatus: parseJobStatus(str(formData.get('job_status'))),
      paymentStatus: parsePaymentStatus(str(formData.get('payment_status'))),
      depositAmountCents: (() => {
        const raw = str(formData.get('deposit_amount'));
        if (!raw) return undefined;
        const n = Math.round(Number(raw) * 100);
        return Number.isFinite(n) && n > 0 ? n : undefined;
      })(),
      amountPaidCents: (() => {
        const raw = str(formData.get('amount_paid'));
        if (!raw) return undefined;
        const n = Math.round(Number(raw) * 100);
        return Number.isFinite(n) && n >= 0 ? n : undefined;
      })(),
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

    if (result.success) {
      revalidatePath('/admin/work-orders');
      revalidatePath('/admin/calendar');
      revalidatePath('/admin/dispatch');
      revalidatePath('/admin/revenue');
      revalidatePath('/admin/notifications');
      revalidatePath('/admin/customers');
    }

    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error while saving job';
    console.error('[createAdminJobAction] unhandled', e);
    return { success: false, errors: [msg], warnings: [] };
  }
}
