import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCustomerPortalAccessUrl } from '@/lib/customer-portal-access';

export type DeliveryChannelStatus = 'not_sent' | 'sent' | 'failed' | 'skipped';

export type ConfirmationDeliveryStatus = {
  guestEmail: string;
  guestPhone: string;
  portalUrl: string | null;
  email: {
    status: DeliveryChannelStatus;
    lastSentAt: string | null;
    lastError: string | null;
    providerMessageId: string | null;
  };
  sms: {
    status: DeliveryChannelStatus;
    lastSentAt: string | null;
    lastError: string | null;
    providerMessageId: string | null;
    twilioDetail: string | null;
  };
  portal: {
    linkCreatedAt: string | null;
    linkLastSentAt: string | null;
    linkLastOpenedAt: string | null;
    customerClaimedAt: string | null;
    authUserLinked: boolean;
    customerId: string | null;
  };
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function mapOutboxStatus(raw: string | null | undefined): DeliveryChannelStatus {
  const s = str(raw).toLowerCase();
  if (s === 'sent' || s === 'delivered' || s === 'queued') return 'sent';
  if (s === 'failed' || s === 'error') return 'failed';
  if (s === 'skipped') return 'skipped';
  return 'not_sent';
}

function latestOutbox(
  rows: Array<Record<string, unknown>>,
  channel: 'email' | 'sms',
  kind = 'booking_confirmation',
) {
  const filtered = rows.filter(
    (r) => str(r.channel).toLowerCase() === channel && str(r.kind) === kind,
  );
  if (filtered.length === 0) return null;
  return filtered[0];
}

export async function loadConfirmationDeliveryStatus(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<ConfirmationDeliveryStatus | null> {
  const id = str(appointmentId);
  if (!id) return null;

  const [{ data: job }, { data: outboxRows }] = await Promise.all([
    admin
      .from('appointments')
      .select(
        'id, guest_email, guest_phone, access_token, customer_id, portal_link_created_at, portal_link_last_sent_at, portal_link_last_opened_at, customer_claimed_account_at',
      )
      .eq('id', id)
      .maybeSingle(),
    admin
      .from('notification_outbox')
      .select(
        'id, kind, channel, status, error_message, skipped_reason, provider_message_id, sent_at, created_at, payload',
      )
      .eq('appointment_id', id)
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  if (!job) return null;
  const row = job as Record<string, unknown>;
  const outbox = (outboxRows ?? []) as Array<Record<string, unknown>>;

  const emailRow = latestOutbox(outbox, 'email');
  const smsRow = latestOutbox(outbox, 'sms');

  const token = str(row.access_token);
  const portalUrl = token ? buildCustomerPortalAccessUrl(id, token) : null;

  let authUserLinked = false;
  const customerId = str(row.customer_id) || null;
  if (customerId) {
    const { data: cust } = await admin.from('customers').select('auth_user_id, portal_account_linked_at').eq('id', customerId).maybeSingle();
    authUserLinked = Boolean((cust as { auth_user_id?: string | null } | null)?.auth_user_id);
    const linkedAt = str((cust as { portal_account_linked_at?: string | null } | null)?.portal_account_linked_at);
    if (linkedAt && !str(row.customer_claimed_account_at)) {
      row.customer_claimed_account_at = linkedAt;
    }
  }

  const smsPayload = (smsRow?.payload && typeof smsRow.payload === 'object' ? smsRow.payload : {}) as Record<string, unknown>;
  const twilioSid = str(smsRow?.provider_message_id) || str(smsPayload.twilio_sid);
  const twilioDetailFromPayload = str(smsPayload.twilio_detail || smsPayload.delivery_detail);
  const twilioDetail =
    twilioDetailFromPayload ||
    (twilioSid ? `Twilio SID ${twilioSid}` : '') ||
    null;

  return {
    guestEmail: str(row.guest_email),
    guestPhone: str(row.guest_phone),
    portalUrl,
    email: {
      status: emailRow ? mapOutboxStatus(str(emailRow.status)) : 'not_sent',
      lastSentAt: str(emailRow?.sent_at || emailRow?.created_at) || null,
      lastError: str(emailRow?.error_message || emailRow?.skipped_reason) || null,
      providerMessageId: str(emailRow?.provider_message_id) || null,
    },
    sms: {
      status: smsRow ? mapOutboxStatus(str(smsRow.status)) : 'not_sent',
      lastSentAt: str(smsRow?.sent_at || smsRow?.created_at) || null,
      lastError: str(smsRow?.error_message || smsRow?.skipped_reason) || null,
      providerMessageId: str(smsRow?.provider_message_id) || null,
      twilioDetail: twilioDetail || null,
    },
    portal: {
      linkCreatedAt: str(row.portal_link_created_at) || null,
      linkLastSentAt: str(row.portal_link_last_sent_at) || null,
      linkLastOpenedAt: str(row.portal_link_last_opened_at) || null,
      customerClaimedAt: str(row.customer_claimed_account_at) || null,
      authUserLinked,
      customerId,
    },
  };
}

export async function markPortalLinkCreated(admin: SupabaseClient, appointmentId: string) {
  const now = new Date().toISOString();
  await admin
    .from('appointments')
    .update({
      portal_link_created_at: now,
      updated_at: now,
    })
    .eq('id', appointmentId)
    .is('portal_link_created_at', null);
}

export async function markPortalLinkSent(admin: SupabaseClient, appointmentId: string) {
  const now = new Date().toISOString();
  await admin
    .from('appointments')
    .update({
      portal_link_last_sent_at: now,
      portal_link_created_at: now,
      updated_at: now,
    })
    .eq('id', appointmentId);
}
