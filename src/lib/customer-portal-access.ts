import type { SupabaseClient } from '@supabase/supabase-js';
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
  const id = encodeURIComponent(appointmentId);
  const token = encodeURIComponent(accessToken);
  return `${base}/portal/job?appointment_id=${id}&token=${token}`;
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
  if (existing) return existing;

  const expiresAt = defaultPortalAccessExpiry(scheduledStartIso ?? row?.scheduled_start);
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

  const expiresAt = str(row.portal_access_expires_at) || (await ensurePortalAccessExpiry(admin, id, str(row.scheduled_start)));

  return {
    ok: true,
    ctx: {
      appointmentId: id,
      workOrderId: id,
      customerId: str(row.customer_id) || null,
      guestEmail: str(row.guest_email).toLowerCase(),
      guestPhone: str(row.guest_phone),
      guestName: str(row.guest_name) || 'Customer',
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
  return { ok: true, expired: isPortalAccessExpired(expiresAt) };
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
): Promise<{ ok: boolean; customerId?: string; linked?: boolean; error?: string }> {
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
    return { ok: false, error: 'This customer record is linked to a different account. Sign in with the booking email or contact Gloss Boss.' };
  }

  if (!existingAuth) {
    const now = new Date().toISOString();
    const { error } = await admin
      .from('customers')
      .update({ auth_user_id: authUserId, portal_account_linked_at: now, updated_at: now })
      .eq('id', customer.id);
    if (error) return { ok: false, error: error.message };
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
): Promise<{ ok: boolean; error?: string; customerId?: string; dashboardUrl?: string }> {
  const verified = await verifyPortalAccess(input.appointmentId, input.token);
  if (!verified.ok) return { ok: false, error: verified.error };
  if (verified.expired) {
    return { ok: false, error: 'This portal link has expired. Contact Gloss Boss ATX for a new link.' };
  }

  const loaded = await loadPortalAccessContext(admin, input.appointmentId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const link = await linkAuthUserToCustomer(admin, {
    authUserId: input.authUserId,
    email: input.email,
    phone: loaded.ctx.guestPhone,
    customerIdHint: loaded.ctx.customerId,
    fullName: input.fullName ?? loaded.ctx.guestName,
  });
  if (!link.ok) return { ok: false, error: link.error };

  if (link.customerId && !loaded.ctx.customerId) {
    const now = new Date().toISOString();
    await admin
      .from('appointments')
      .update({ customer_id: link.customerId, customer_claimed_account_at: now, updated_at: now })
      .eq('id', input.appointmentId);
  } else if (link.customerId && loaded.ctx.customerId && loaded.ctx.customerId !== link.customerId) {
    await admin
      .from('appointments')
      .update({ customer_id: link.customerId, updated_at: new Date().toISOString() })
      .eq('id', input.appointmentId)
      .is('customer_id', null);
  }

  const dashboardUrl = `/dashboard?job=${encodeURIComponent(input.appointmentId)}`;
  return { ok: true, customerId: link.customerId, dashboardUrl };
}
