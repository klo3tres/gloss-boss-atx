'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { actionErr, actionOk, actionWarn, type ActionResult } from '@/lib/action-result';
import {
  loadBookingConfirmationContext,
  sendBookingConfirmation,
} from '@/lib/booking-confirmation-send';
import { loadPortalAccessContext } from '@/lib/customer-portal-access';
import { loadConfirmationDeliveryStatus } from '@/lib/confirmation-delivery-status';
import { buildCustomerPortalAccessUrl, defaultPortalAccessExpiry } from '@/lib/customer-portal-access';

async function requireStaffAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return null;
  return admin;
}

export async function previewBookingConfirmationAction(appointmentId: string): Promise<{
  ok?: boolean;
  error?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  emailSubject?: string;
  emailBodyPlain?: string;
  smsBody?: string;
  whenLabel?: string;
  service?: string;
  portalUrl?: string;
}> {
  const admin = await requireStaffAdmin();
  if (!admin) return { error: 'Forbidden' };
  const loaded = await loadBookingConfirmationContext(admin, appointmentId);
  if (!loaded.ok) return { error: loaded.error };
  const ctx = loaded.ctx;
  await admin.from('customer_portal_events').insert({
    appointment_id: appointmentId,
    customer_id: ctx.customerId,
    event_type: 'message_previewed',
    admin_preview: true,
    counted: false,
    user_agent_classification: 'staff',
    channel_source: 'work_order_confirmation',
    metadata: { channels: ['email', 'sms'] },
  });
  return {
    ok: true,
    guestName: ctx.guestName,
    guestEmail: ctx.guestEmail || undefined,
    guestPhone: ctx.guestPhone || undefined,
    emailSubject: ctx.emailSubject,
    emailBodyPlain: [
      `Hi ${ctx.guestName},`,
      '',
      `Your Gloss Boss ATX appointment is confirmed for ${ctx.whenLabel}.`,
      `Service: ${ctx.service}`,
      `Vehicle(s): ${ctx.vehicles}`,
      ctx.address ? `Address: ${ctx.address}` : '',
      `Duration: ${ctx.duration}`,
      `Total: $${(ctx.totalCents / 100).toFixed(2)} · Deposit: $${(ctx.depositCents / 100).toFixed(2)} · Balance: $${(ctx.balanceCents / 100).toFixed(2)}`,
      '',
      'Before we arrive: clear vehicle access, remove personal items, ensure water/power if needed.',
      `View portal: ${ctx.portalUrl}`,
    ]
      .filter(Boolean)
      .join('\n'),
    smsBody: ctx.smsBody,
    whenLabel: ctx.whenLabel,
    service: ctx.service,
    portalUrl: ctx.portalUrl,
  };
}

export async function getCustomerPortalLinkAction(appointmentId: string): Promise<{ ok?: boolean; error?: string; portalUrl?: string }> {
  const admin = await requireStaffAdmin();
  if (!admin) return { error: 'Forbidden' };
  const loaded = await loadPortalAccessContext(admin, appointmentId);
  if (!loaded.ok) return { error: loaded.error };
  return { ok: true, portalUrl: loaded.ctx.portalUrl };
}

export async function regenerateCustomerPortalLinkAction(
  appointmentId: string,
): Promise<{ ok?: boolean; error?: string; portalUrl?: string }> {
  const admin = await requireStaffAdmin();
  if (!admin) return { error: 'Forbidden' };
  const { data: appointment } = await admin
    .from('appointments')
    .select('scheduled_start')
    .eq('id', appointmentId)
    .maybeSingle();
  if (!appointment) return { error: 'Appointment not found' };
  const token = randomBytes(24).toString('hex');
  const now = new Date().toISOString();
  const { error } = await admin
    .from('appointments')
    .update({
      access_token: token,
      portal_access_expires_at: defaultPortalAccessExpiry(appointment.scheduled_start),
      portal_link_last_regenerated_at: now,
      portal_link_revoked_at: null,
      updated_at: now,
    })
    .eq('id', appointmentId);
  if (error) return { error: error.message };
  revalidatePath(`/tech/work-orders/${appointmentId}`);
  revalidatePath(`/admin/customer-preview/${appointmentId}`);
  return { ok: true, portalUrl: buildCustomerPortalAccessUrl(appointmentId, token) };
}

export async function getConfirmationDeliveryStatusAction(appointmentId: string) {
  const admin = await requireStaffAdmin();
  if (!admin) return { error: 'Forbidden' as const };
  const status = await loadConfirmationDeliveryStatus(admin, appointmentId);
  return { status };
}

export async function sendBookingConfirmationBothAction(appointmentId: string): Promise<ActionResult & { smsDetail?: string }> {
  const admin = await requireStaffAdmin();
  if (!admin) return actionErr('Forbidden');
  const result = await sendBookingConfirmation(admin, { appointmentId, channel: 'both' });
  revalidatePath(`/tech/work-orders/${appointmentId}`);
  revalidatePath('/admin/notifications');
  if (result.email?.status === 'failed' || result.sms?.status === 'failed') {
    return actionErr(
      [result.email?.error, result.sms?.error].filter(Boolean).join(' · ') || 'Confirmation partially failed.',
    );
  }
  if (
    result.email?.status === 'queued' ||
    result.email?.status === 'sent' ||
    result.email?.status === 'delivered' ||
    result.sms?.status === 'queued' ||
    result.sms?.status === 'sent' ||
    result.sms?.status === 'delivered'
  ) {
    return { ...actionOk('Confirmation accepted for delivery.'), smsDetail: result.sms?.twilioDetail };
  }
  return actionErr(result.error ?? 'Could not send confirmation.');
}

export async function resendBookingConfirmationEmailAction(appointmentId: string): Promise<ActionResult> {
  const admin = await requireStaffAdmin();
  if (!admin) return actionErr('Forbidden');
  const result = await sendBookingConfirmation(admin, { appointmentId, channel: 'email' });
  revalidatePath(`/tech/work-orders/${appointmentId}`);
  if (['queued', 'sent', 'delivered'].includes(result.email?.status ?? '')) {
    return actionOk(`Confirmation email ${result.email?.status}.`);
  }
  return actionErr(result.email?.error ?? result.email?.skippedReason ?? result.error ?? 'Email send failed.');
}

export async function resendBookingConfirmationSmsAction(appointmentId: string): Promise<ActionResult & { smsDetail?: string }> {
  const admin = await requireStaffAdmin();
  if (!admin) return actionErr('Forbidden');
  const result = await sendBookingConfirmation(admin, { appointmentId, channel: 'sms' });
  revalidatePath(`/tech/work-orders/${appointmentId}`);
  if (['queued', 'sent', 'delivered'].includes(result.sms?.status ?? '')) {
    return { ...actionOk(`Confirmation SMS ${result.sms?.status}.`), smsDetail: result.sms?.twilioDetail };
  }
  return actionErr(result.sms?.error ?? result.sms?.skippedReason ?? result.error ?? 'SMS send failed.');
}

export async function sendBookingConfirmationAction(input: {
  appointmentId: string;
  channel?: 'both' | 'email' | 'sms';
  customEmailSubject?: string;
  customEmailBodyPlain?: string;
  customSmsBody?: string;
}): Promise<ActionResult & { emailStatus?: string; smsStatus?: string; smsDetail?: string }> {
  const admin = await requireStaffAdmin();
  if (!admin) return actionErr('Forbidden');

  const loaded = await loadBookingConfirmationContext(admin, input.appointmentId);
  if (!loaded.ok) return actionErr(loaded.error);

  let customEmailHtml: string | undefined;
  if (input.customEmailBodyPlain?.trim()) {
    const escaped = input.customEmailBodyPlain
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');
    const { glossBossEmailLayout } = await import('@/lib/email/templates/layout');
    customEmailHtml = glossBossEmailLayout({
      title: 'Booking confirmation',
      preview: 'Your Gloss Boss ATX appointment is confirmed',
      headline: 'Booking confirmed',
      bodyHtml: `<p style="color:#e4e4e7;font-size:15px;line-height:1.6;">${escaped}</p>`,
    });
  }

  const result = await sendBookingConfirmation(admin, {
    appointmentId: input.appointmentId,
    customEmailHtml,
    customEmailSubject: input.customEmailSubject,
    customSmsBody: input.customSmsBody,
    channel: input.channel ?? 'both',
  });

  revalidatePath(`/tech/work-orders/${input.appointmentId}`);
  revalidatePath('/admin/notifications');

  const emailLine = result.email
    ? `Email: ${result.email.status}${result.email.error ? ` (${result.email.error})` : result.email.skippedReason ? ` (${result.email.skippedReason})` : ''}`
    : '';
  const smsLine = result.sms
    ? `SMS: ${result.sms.status}${result.sms.error ? ` (${result.sms.error})` : result.sms.skippedReason ? ` (${result.sms.skippedReason})` : ''}`
    : '';

  const message = [emailLine, smsLine, result.sms?.twilioDetail].filter(Boolean).join(' · ');

  if (result.email?.status === 'failed' || result.sms?.status === 'failed') {
    return {
      ...actionWarn(message || 'Confirmation partially failed.'),
      emailStatus: result.email?.status,
      smsStatus: result.sms?.status,
      smsDetail: result.sms?.twilioDetail,
    };
  }

  if (
    result.email?.status === 'queued' ||
    result.email?.status === 'sent' ||
    result.email?.status === 'delivered' ||
    result.sms?.status === 'queued' ||
    result.sms?.status === 'sent' ||
    result.sms?.status === 'delivered'
  ) {
    return {
      ...actionOk(message || 'Confirmation sent.'),
      emailStatus: result.email?.status,
      smsStatus: result.sms?.status,
    };
  }

  return actionErr(message || result.error || 'Could not send confirmation — check email/SMS configuration.');
}
