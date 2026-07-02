import type { SupabaseClient } from '@supabase/supabase-js';
import { resendConfigured, sendResendHtml } from '@/lib/email-send';
import { sendCustomerSms } from '@/lib/sms-send';
import { emitOwnerNotification } from '@/lib/titan/owner-notification-router';
import { buildCustomerPortalAccessUrl, loadPortalAccessContext } from '@/lib/customer-portal-access';
import type { WorkOrderStage } from '@/lib/work-order-lifecycle';
import { glossBossEmailLayout, emailParagraph, emailCtaButton, escapeEmailHtml } from '@/lib/email/templates/layout';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  assigned: 'Technician assigned',
  en_route: 'On the way',
  arrived: 'Arrived',
  in_progress: 'In progress',
  quality_check: 'Quality check',
  payment_due: 'Payment needed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function customerStatusLabel(stageOrStatus: string): string {
  const key = stageOrStatus.toLowerCase();
  return CUSTOMER_STATUS_LABELS[key] ?? key.replace(/_/g, ' ');
}

export async function notifyCustomerWorkOrderStatusUpdate(
  admin: SupabaseClient,
  input: {
    appointmentId: string;
    fromStage?: WorkOrderStage | string | null;
    toStage: WorkOrderStage | string;
    notifyCustomer?: boolean;
  },
): Promise<void> {
  const appointmentId = str(input.appointmentId);
  if (!appointmentId) return;

  const { data: job } = await admin
    .from('appointments')
    .select('guest_name, guest_email, guest_phone, access_token, scheduled_start, service_slug')
    .eq('id', appointmentId)
    .maybeSingle();
  if (!job) return;

  const row = job as Record<string, unknown>;
  const guestName = str(row.guest_name) || 'Customer';
  const guestEmail = str(row.guest_email).toLowerCase();
  const guestPhone = str(row.guest_phone);
  const token = str(row.access_token);
  const statusLabel = customerStatusLabel(String(input.toStage));
  const portalUrl = token ? buildCustomerPortalAccessUrl(appointmentId, token) : `${(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/dashboard`;

  const preview = `Your Gloss Boss appointment is now: ${statusLabel}. View updates in your portal.`;
  const smsBody = `Gloss Boss ATX — Hi ${guestName}, your detail status: ${statusLabel}. View appointment, photos & updates: ${portalUrl}`;

  let emailStatus = 'skipped';
  let smsStatus = 'skipped';
  let emailError: string | undefined;
  let smsError: string | undefined;

  if (input.notifyCustomer !== false) {
    if (guestEmail.includes('@') && resendConfigured()) {
      const html = glossBossEmailLayout({
        title: 'Appointment update',
        preview,
        headline: 'Status update',
        bodyHtml:
          emailParagraph(`Hi ${escapeEmailHtml(guestName)},`, false) +
          emailParagraph(`Your Gloss Boss appointment status is now <strong style="color:#fcd34d;">${escapeEmailHtml(statusLabel)}</strong>.`, true) +
          emailParagraph('View your appointment, photos, loyalty rewards, and referral link in your customer portal.', true) +
          emailCtaButton(portalUrl, 'View my appointment'),
      });
      const sent = await sendResendHtml({ to: guestEmail, subject: `Gloss Boss ATX — ${statusLabel}`, html });
      emailStatus = sent.ok ? 'sent' : 'failed';
      emailError = sent.ok ? undefined : sent.error;
    }

    if (guestPhone) {
      const smsResult = await sendCustomerSms({
        db: admin,
        kind: 'status_update',
        template_key: 'work_order_status',
        to: guestPhone,
        appointment_id: appointmentId,
        body: smsBody,
        requireConsent: false,
        extraPayload: { status: input.toStage, portal_url: portalUrl },
      });
      if (smsResult.skipped) smsStatus = 'skipped';
      else if (smsResult.ok) smsStatus = 'sent';
      else {
        smsStatus = 'failed';
        smsError = smsResult.error;
      }
    }
  }

  await emitOwnerNotification(admin, {
    eventType: emailStatus === 'failed' || smsStatus === 'failed' ? 'delivery_failed' : 'work_order_created',
    title: `Work order status → ${statusLabel}`,
    body: [`${guestName} · ${statusLabel}`, guestEmail ? `Email: ${emailStatus}` : '', guestPhone ? `SMS: ${smsStatus}` : '']
      .filter(Boolean)
      .join('\n'),
    source: 'work_order_status',
    relatedType: 'appointment',
    relatedId: appointmentId,
    relatedUrl: `/admin/work-orders/${appointmentId}?shell=admin`,
    bypassQuietHours: emailStatus === 'failed' || smsStatus === 'failed',
    emailStatus: emailStatus as 'sent' | 'failed' | 'skipped',
    smsStatus: smsStatus as 'sent' | 'failed' | 'skipped',
  });

  try {
    await admin.from('notification_outbox').insert({
      appointment_id: appointmentId,
      kind: 'work_order_status',
      channel: 'multi',
      provider: 'titan',
      status: emailStatus === 'failed' || smsStatus === 'failed' ? 'failed' : 'sent',
      template_key: 'work_order_status',
      error_message: emailError ?? smsError ?? null,
      payload: { to_stage: input.toStage, from_stage: input.fromStage ?? null, portal_url: portalUrl },
      created_at: new Date().toISOString(),
    });
  } catch {
    /* best-effort */
  }
}

export async function notifyCustomerPhotosUploaded(
  admin: SupabaseClient,
  appointmentId: string,
  category: 'before' | 'after' | string,
): Promise<void> {
  const loaded = await loadPortalAccessContext(admin, appointmentId);
  if (!loaded.ok) return;
  const ctx = loaded.ctx;
  const label = category === 'after' ? 'After photos are ready' : 'Before photos uploaded';

  if (ctx.guestPhone) {
    await sendCustomerSms({
      db: admin,
      kind: 'photo_uploaded',
      template_key: 'photos_uploaded',
      to: ctx.guestPhone,
      appointment_id: appointmentId,
      body: `Gloss Boss ATX — ${label}. View in your portal: ${ctx.portalUrl}`,
      requireConsent: false,
    });
  }

  await emitOwnerNotification(admin, {
    eventType: 'work_order_completed',
    title: label,
    body: `${ctx.guestName} · photos visible in customer portal`,
    source: 'work_order_photos',
    relatedType: 'appointment',
    relatedId: appointmentId,
    relatedUrl: `/admin/work-orders/${appointmentId}?shell=admin`,
  });
}
