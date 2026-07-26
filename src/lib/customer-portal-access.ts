import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverableCustomerEmail } from '@/lib/customer-contact';
import { verifyAppointmentAccessToken } from '@/lib/appointment-lifecycle';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '');
}

export type PortalAccessContext = {
  appointmentId: string;
  workOrderId: string;
  customerId: string | null;
  guestEmail: string;
  guestPhone: string;
  guestName: string;
  accessToken: string;
  portalUrl: string;
  expiresAt: string | null;
};

export function buildCustomerPortalAccessUrl(appointmentId: string, accessToken: string) {
  const base = appBaseUrl();
  void appointmentId;
  const token = encodeURIComponent(accessToken);
  return `${base}/booking/${token}`;
}

export function defaultPortalAccessExpiry(scheduledStartIso?: string | null): string {
  const start = scheduledStartIso ? new Date(scheduledStartIso) : new Date();
  const base = Number.isNaN(start.getTime()) ? new Date() : start;
  const expires = new Date(base.getTime() + 120 * 24 * 60 * 60 * 1000);
  return expires.toISOString();
}

export async function ensurePortalAccessExpiry(
  admin: SupabaseClient,
  appointmentId: string,
  scheduledStartIso?: string | null,
): Promise<string | null> {
  const { data } = await admin
    .from('appointments')
    .select('portal_access_expires_at, scheduled_start')
    .eq('id', appointmentId)
    .maybeSingle();
  const row = data as { portal_access_expires_at?: string | null; scheduled_start?: string | null } | null;
  const existing = str(row?.portal_access_expires_at);
  if (existing && !isPortalAccessExpired(existing)) return existing;

  const scheduledExpiry = defaultPortalAccessExpiry(scheduledStartIso ?? row?.scheduled_start);
  const expiresAt = isPortalAccessExpired(scheduledExpiry) ? defaultPortalAccessExpiry(null) : scheduledExpiry;
  await admin
    .from('appointments')
    .update({ portal_access_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq('id', appointmentId);
  return expiresAt;
}

export async function loadPortalAccessContext(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<{ ok: true; ctx: PortalAccessContext } | { ok: false; error: string }> {
  const id = str(appointmentId);
  if (!id) return { ok: false, error: 'Missing appointment' };

  const { data: job } = await admin
    .from('appointments')
    .select('id, customer_id, guest_email, guest_phone, guest_name, access_token, portal_access_expires_at, scheduled_start')
    .eq('id', id)
    .maybeSingle();
  if (!job) return { ok: false, error: 'Appointment not found' };

  const row = job as Record<string, unknown>;
  const token = str(row.access_token);
  if (!token) return { ok: false, error: 'Portal access token missing on appointment' };
  const customerId = str(row.customer_id) || null;
  let guestEmail = str(row.guest_email).toLowerCase();
  let guestPhone = str(row.guest_phone);
  let guestName = str(row.guest_name) || 'Customer';
  if (customerId && (!guestEmail || !guestPhone || guestName === 'Customer')) {
    const { data: customer } = await admin
      .from('customers')
      .select('email, phone, full_name')
      .eq('id', customerId)
      .maybeSingle();
    guestEmail = guestEmail || str(customer?.email).toLowerCase();
    guestPhone = guestPhone || str(customer?.phone);
    guestName = guestName === 'Customer' ? str(customer?.full_name) || guestName : guestName;
  }

  const expiresAt = str(row.portal_access_expires_at) || (await ensurePortalAccessExpiry(admin, id, str(row.scheduled_start)));

  return {
    ok: true,
    ctx: {
      appointmentId: id,
      workOrderId: id,
      customerId,
      guestEmail,
      guestPhone,
      guestName,
      accessToken: token,
      portalUrl: buildCustomerPortalAccessUrl(id, token),
      expiresAt: expiresAt || null,
    },
  };
}

export function isPortalAccessExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const d = new Date(expiresAt);
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}

export async function verifyPortalAccess(
  appointmentId: string,
  token: string,
): Promise<{ ok: true; expired: boolean } | { ok: false; error: string }> {
  const id = str(appointmentId);
  const t = str(token);
  if (!id || !t) return { ok: false, error: 'Invalid portal link' };

  const valid = await verifyAppointmentAccessToken(id, t);
  if (!valid) return { ok: false, error: 'This portal link is invalid or has expired.' };

  const admin = (await import('@/lib/supabase/safeClient')).tryCreateAdminSupabase();
  if (!admin) return { ok: true, expired: false };

  const { data } = await admin.from('appointments').select('portal_access_expires_at').eq('id', id).maybeSingle();
  const expiresAt = str((data as { portal_access_expires_at?: string } | null)?.portal_access_expires_at);
  if (isPortalAccessExpired(expiresAt)) {
    await ensurePortalAccessExpiry(admin, id, null);
  }
  return { ok: true, expired: false };
}

/**
 * Links the authenticated Supabase user to an existing CRM customer record by email/phone.
 * Never creates duplicate customers when a match already exists.
 */
export async function linkAuthUserToCustomer(
  admin: SupabaseClient,
  input: {
    authUserId: string;
    email: string;
    phone?: string | null;
    customerIdHint?: string | null;
    fullName?: string | null;
  },
): Promise<{ ok: boolean; customerId?: string; linked?: boolean; error?: string; errorCode?: 'conflict' | 'unavailable' }> {
  const authUserId = str(input.authUserId);
  const email = str(input.email).toLowerCase();
  if (!authUserId || !email.includes('@')) return { ok: false, error: 'Missing auth user or email' };

  const hint = str(input.customerIdHint);
  type CustomerRow = { id: string; auth_user_id?: string | null; email?: string | null };
  let customer: CustomerRow | null = null;

  if (hint) {
    const { data } = await admin.from('customers').select('id, auth_user_id, email').eq('id', hint).maybeSingle();
    if (data?.id) customer = data as CustomerRow;
  }

  if (!customer) {
    const { data } = await admin.from('customers').select('id, auth_user_id, email').ilike('email', email).maybeSingle();
    if (data?.id) customer = data as CustomerRow;
  }

  if (!customer && input.phone) {
    const phone = str(input.phone);
    if (phone.length >= 10) {
      const { data } = await admin
        .from('customers')
        .select('id, auth_user_id, email')
        .eq('phone', phone)
        .maybeSingle();
      if (data?.id) customer = data as CustomerRow;
    }
  }

  if (!customer) {
    const insertRow: Record<string, unknown> = {
      email,
      full_name: str(input.fullName) || null,
      phone: str(input.phone) || null,
      auth_user_id: authUserId,
      updated_at: new Date().toISOString(),
    };
    const ins = await admin.from('customers').insert(insertRow).select('id').maybeSingle();
    if (ins.error) {
      if (/duplicate|unique/i.test(ins.error.message)) {
        const { data: retry } = await admin.from('customers').select('id, auth_user_id').ilike('email', email).maybeSingle();
        if (retry?.id) customer = retry as CustomerRow;
      } else {
        return { ok: false, error: ins.error.message };
      }
    } else if (ins.data?.id) {
      return { ok: true, customerId: String(ins.data.id), linked: true };
    }
  }

  if (!customer?.id) return { ok: false, error: 'Could not resolve customer record' };

  const existingAuth = str(customer.auth_user_id);
  if (existingAuth && existingAuth !== authUserId) {
    return {
      ok: false,
      error: 'This customer record is linked to a different account. Sign in with the booking email or contact Gloss Boss.',
      errorCode: 'conflict',
    };
  }

  if (!existingAuth) {
    const now = new Date().toISOString();
    const currentEmail = deliverableCustomerEmail(customer.email);
    const { data, error } = await admin
      .from('customers')
      .update({
        auth_user_id: authUserId,
        email: currentEmail || email,
        portal_account_linked_at: now,
        updated_at: now,
      })
      .eq('id', customer.id)
      .is('auth_user_id', null)
      .select('id')
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data?.id) {
      const { data: owner } = await admin
        .from('customers')
        .select('auth_user_id')
        .eq('id', customer.id)
        .maybeSingle();
      if (str(owner?.auth_user_id) !== authUserId) {
        return {
          ok: false,
          error: 'This customer record was linked to another account. Sign in with the booking email or contact Gloss Boss.',
          errorCode: 'conflict',
        };
      }
      return { ok: true, customerId: customer.id, linked: false };
    }
    return { ok: true, customerId: customer.id, linked: true };
  }

  return { ok: true, customerId: customer.id, linked: false };
}

export async function claimPortalAppointmentForUser(
  admin: SupabaseClient,
  input: {
    appointmentId: string;
    token: string;
    authUserId: string;
    email: string;
    fullName?: string | null;
  },
): Promise<{
  ok: boolean;
  error?: string;
  errorCode?: 'invalid_link' | 'email_mismatch' | 'account_conflict' | 'temporarily_unavailable';
  customerId?: string;
  dashboardUrl?: string;
  accountLinkedNow?: boolean;
}> {
  const verified = await verifyPortalAccess(input.appointmentId, input.token);
  if (!verified.ok) return { ok: false, error: verified.error, errorCode: 'invalid_link' };
  const loaded = await loadPortalAccessContext(admin, input.appointmentId);
  if (!loaded.ok) return { ok: false, error: loaded.error, errorCode: 'temporarily_unavailable' };

  const signedInEmail = str(input.email).toLowerCase();
  const bookingEmail = deliverableCustomerEmail(loaded.ctx.guestEmail);
  if (bookingEmail && signedInEmail !== bookingEmail) {
    return {
      ok: false,
      error: 'This account does not match the booking email. Sign out to continue as a guest, or sign in with the email on the booking.',
      errorCode: 'email_mismatch',
    };
  }

  const { data: alreadyLinked } = await admin
    .from('customers')
    .select('id')
    .eq('auth_user_id', input.authUserId)
    .maybeSingle();
  if (
    alreadyLinked?.id &&
    loaded.ctx.customerId &&
    String(alreadyLinked.id) !== loaded.ctx.customerId
  ) {
    return {
      ok: false,
      error: 'This account belongs to a different customer record. Sign out to use the secure guest link.',
      errorCode: 'account_conflict',
    };
  }

  const link = await linkAuthUserToCustomer(admin, {
    authUserId: input.authUserId,
    email: input.email,
    phone: loaded.ctx.guestPhone,
    customerIdHint: loaded.ctx.customerId ?? (alreadyLinked?.id ? String(alreadyLinked.id) : null),
    fullName: input.fullName ?? loaded.ctx.guestName,
  });
  if (!link.ok) {
    return {
      ok: false,
      error: link.error,
      errorCode: link.errorCode === 'conflict' ? 'account_conflict' : 'temporarily_unavailable',
    };
  }

  if (link.customerId) {
    const now = new Date().toISOString();
    const claimUpdate = await admin
      .from('appointments')
      .update({
        customer_id: link.customerId,
        customer_claimed_account_at: now,
        account_created_at: now,
        account_claim_status: 'linked',
        account_claim_error: null,
        updated_at: now,
      })
      .eq('id', input.appointmentId)
      .or(`customer_id.is.null,customer_id.eq.${link.customerId}`)
      .select('id')
      .maybeSingle();
    if (claimUpdate.error || !claimUpdate.data?.id) {
      const claimError = claimUpdate.error?.message ?? 'Booking ownership changed before the account claim completed.';
      await admin
        .from('appointments')
        .update({
          account_claim_status: 'failed',
          account_claim_error: claimError.slice(0, 1000),
          updated_at: now,
        })
        .eq('id', input.appointmentId);
      return {
        ok: false,
        error: 'Your account exists, but this booking could not be linked yet. Please retry or contact Gloss Boss.',
        errorCode: 'temporarily_unavailable',
      };
    }
  }

  const dashboardUrl = `/dashboard?job=${encodeURIComponent(input.appointmentId)}`;
  const { data: qaAppointment } = await admin
    .from('appointments')
    .select('is_test, qa_expires_at')
    .eq('id', input.appointmentId)
    .maybeSingle();
  if (qaAppointment?.is_test === true && link.customerId) {
    await admin
      .from('customers')
      .update({
        is_test: true,
        qa_expires_at: qaAppointment.qa_expires_at ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', link.customerId);
  }
  return { ok: true, customerId: link.customerId, dashboardUrl, accountLinkedNow: Boolean(link.linked) };
}
