import type { SupabaseClient } from '@supabase/supabase-js';
import { pushoverConfigured, sendPushoverNotification } from '@/lib/pushover';
import { resendConfigured, sendResendHtml, twilioConfigured } from '@/lib/email-send';
import { sendCustomerSms } from '@/lib/sms-send';
import { resolveOwnerNotifyContact } from '@/lib/owner-contact';
import { businessNotifyPhone } from '@/lib/business-booking-notify';
import {
  insertTitanNotificationEvent,
  updateNotificationChannelStatuses,
} from '@/lib/titan/notification-events';
import {
  eventAllowed,
  isInQuietHours,
  loadOwnerNotificationPreferences,
  priorityForEvent,
  type OwnerNotificationEventType,
} from '@/lib/titan/notification-preferences';

export type EmitOwnerNotificationInput = {
  eventType: OwnerNotificationEventType;
  title: string;
  body: string;
  source?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  relatedType?: string;
  relatedId?: string;
  relatedUrl?: string;
  workspaceKey?: string;
  /** Skip channel delivery if caller already sent (status only) */
  emailStatus?: string;
  smsStatus?: string;
  /** Force delivery even in quiet hours for urgent failures */
  bypassQuietHours?: boolean;
};

function statusLabel(ok: boolean | undefined, skipped?: boolean, error?: string): string {
  if (skipped) return 'skipped';
  if (ok) return 'sent';
  if (error) return 'failed';
  return 'skipped';
}

export async function emitOwnerNotification(
  admin: SupabaseClient | null,
  input: EmitOwnerNotificationInput,
): Promise<{ eventId?: string; emailStatus: string; smsStatus: string; pushoverStatus: string }> {
  const noop = { emailStatus: 'skipped', smsStatus: 'skipped', pushoverStatus: 'skipped' };
  if (!admin) return noop;

  const prefs = await loadOwnerNotificationPreferences(admin, input.workspaceKey ?? 'default');
  if (!eventAllowed(prefs, input.eventType)) return noop;

  const quiet = !input.bypassQuietHours && isInQuietHours(prefs);
  const priority = input.priority ?? priorityForEvent(input.eventType);
  const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '');
  const relatedUrl = input.relatedUrl ?? `${appBase}/admin/notifications`;

  let emailStatus = input.emailStatus ?? 'skipped';
  let smsStatus = input.smsStatus ?? 'skipped';
  let pushoverStatus = 'skipped';

  const inserted = await insertTitanNotificationEvent(admin, {
    workspaceKey: input.workspaceKey,
    title: input.title,
    body: input.body,
    source: input.source ?? 'titan',
    priority,
    relatedType: input.relatedType,
    relatedId: input.relatedId,
    relatedUrl,
    emailStatus,
    smsStatus,
    pushoverStatus,
  });

  const eventId = inserted.id;

  if (quiet) {
    if (eventId) {
      await updateNotificationChannelStatuses(admin, eventId, {
        emailStatus: 'quiet_hours',
        smsStatus: 'quiet_hours',
        pushoverStatus: 'quiet_hours',
      });
    }
    return { eventId, emailStatus: 'quiet_hours', smsStatus: 'quiet_hours', pushoverStatus: 'quiet_hours' };
  }

  const contact = await resolveOwnerNotifyContact(admin);
  const ownerPhone = contact.phone ?? businessNotifyPhone();

  if (!input.emailStatus && prefs.notifyEmailEnabled && contact.email && resendConfigured()) {
    const sent = await sendResendHtml({
      to: contact.email,
      subject: `Gloss Boss — ${input.title}`,
      html: `<p style="font-family:system-ui;line-height:1.5">${input.body.replace(/\n/g, '<br/>')}</p>${relatedUrl ? `<p><a href="${relatedUrl}">Open in Titan</a></p>` : ''}`,
    });
    emailStatus = statusLabel(sent.ok, false, sent.error);
  }

  if (!input.smsStatus && prefs.notifySmsEnabled && ownerPhone && twilioConfigured()) {
    const sms = await sendCustomerSms({
      db: admin,
      kind: `owner_${input.eventType}`,
      template_key: `owner_${input.eventType}`,
      to: ownerPhone,
      body: `${input.title}\n${input.body.slice(0, 280)}`,
      requireConsent: false,
      extraPayload: { owner_alert: true, event_type: input.eventType },
    });
    smsStatus = statusLabel(sms.ok, sms.skipped, sms.error);
  }

  if (prefs.notifyPushoverEnabled && pushoverConfigured()) {
    const push = await sendPushoverNotification({
      title: input.title,
      message: input.body.slice(0, 1024),
      url: relatedUrl,
      priority: priority === 'urgent' || priority === 'high' ? 1 : 0,
    });
    pushoverStatus = statusLabel(push.ok, push.skipped, push.error);
  } else if (!pushoverConfigured()) {
    pushoverStatus = 'not_configured';
  }

  if (eventId) {
    await updateNotificationChannelStatuses(admin, eventId, {
      emailStatus,
      smsStatus,
      pushoverStatus,
      providerPayload: { event_type: input.eventType, quiet_hours: false },
    });
  }

  return { eventId, emailStatus, smsStatus, pushoverStatus };
}
