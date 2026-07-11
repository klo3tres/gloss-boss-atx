import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { agreementUrl, appOrigin } from '@/lib/auth/action-link-registry';
import type { AgreementStatus } from '@/lib/agreements/status';
import { resolveDisplayStatus } from '@/lib/agreements/status';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export function hashAgreementToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateAgreementToken(): string {
  return randomBytes(32).toString('base64url');
}

export type AgreementRequestRow = {
  id: string;
  appointmentId: string | null;
  customerId: string | null;
  status: AgreementStatus;
  tokenExpiresAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  verbalAt: string | null;
  signerName: string | null;
  deliveryChannel: string | null;
  failureReason: string | null;
  scheduledSendAt: string | null;
  marketingMediaConsent: boolean | null;
  smsConsentSelection: boolean | null;
  templateVersion: number;
  securePath: string | null;
};

function mapRequest(row: Record<string, unknown>): AgreementRequestRow {
  return {
    id: str(row.id),
    appointmentId: str(row.appointment_id) || null,
    customerId: str(row.customer_id) || null,
    status: resolveDisplayStatus({ requestStatus: str(row.status) }),
    tokenExpiresAt: str(row.token_expires_at),
    sentAt: str(row.sent_at) || null,
    deliveredAt: str(row.delivered_at) || null,
    viewedAt: str(row.viewed_at) || null,
    signedAt: str(row.signed_at) || null,
    verbalAt: str(row.verbal_at) || null,
    signerName: str(row.signer_name) || null,
    deliveryChannel: str(row.delivery_channel) || null,
    failureReason: str(row.failure_reason) || null,
    scheduledSendAt: str(row.scheduled_send_at) || null,
    marketingMediaConsent: row.marketing_media_consent == null ? null : Boolean(row.marketing_media_consent),
    smsConsentSelection: row.sms_consent_selection == null ? null : Boolean(row.sms_consent_selection),
    templateVersion: Number(row.template_version ?? 1) || 1,
    securePath: str(row.secure_path) || null,
  };
}

export async function logAgreementEvent(
  admin: SupabaseClient,
  input: {
    requestId?: string | null;
    appointmentId?: string | null;
    customerId?: string | null;
    eventType: string;
    detail?: string;
    actorUserId?: string | null;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await admin.from('agreement_events').insert({
      agreement_request_id: input.requestId ?? null,
      appointment_id: input.appointmentId ?? null,
      customer_id: input.customerId ?? null,
      event_type: input.eventType,
      detail: input.detail ?? null,
      actor_user_id: input.actorUserId ?? null,
      meta: input.meta ?? {},
    });
  } catch (e) {
    console.warn('[agreement_events]', input.eventType, e instanceof Error ? e.message : e);
  }
}

export async function syncDenormalizedAgreementStatus(
  admin: SupabaseClient,
  input: {
    appointmentId?: string | null;
    workOrderId?: string | null;
    requestId?: string | null;
    status: AgreementStatus;
    signedAt?: string | null;
    viewedAt?: string | null;
  },
): Promise<void> {
  const patch: Record<string, unknown> = {
    agreement_status: input.status,
    agreement_request_id: input.requestId ?? null,
    updated_at: new Date().toISOString(),
  };
  if (input.signedAt) patch.agreement_signed_at = input.signedAt;
  if (input.viewedAt) patch.agreement_viewed_at = input.viewedAt;

  if (input.appointmentId) {
    await admin
      .from('appointments')
      .update({
        agreement_status: input.status,
        agreement_request_id: input.requestId ?? null,
      })
      .eq('id', input.appointmentId);
    await admin.from('work_orders').update(patch).eq('appointment_id', input.appointmentId);
  }
  if (input.workOrderId) {
    await admin.from('work_orders').update(patch).eq('id', input.workOrderId);
  }
}

/** Ensure an open agreement request exists; returns plaintext token when newly created or rotated. */
export async function ensureAgreementRequest(
  admin: SupabaseClient,
  input: {
    appointmentId: string;
    customerId?: string | null;
    workOrderId?: string | null;
    accessToken: string;
    createdBy?: string | null;
    rotateToken?: boolean;
  },
): Promise<{ ok: boolean; request?: AgreementRequestRow; token?: string; url?: string; error?: string }> {
  const { data: existing } = await admin
    .from('agreement_requests')
    .select('*')
    .eq('appointment_id', input.appointmentId)
    .not('status', 'in', '("voided","signed","verbal")')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && !input.rotateToken) {
    const request = mapRequest(existing as Record<string, unknown>);
    const url = agreementUrl({
      appointmentId: input.appointmentId,
      token: input.accessToken,
    });
    return { ok: true, request, url };
  }

  const token = generateAgreementToken();
  const expires = new Date();
  expires.setDate(expires.getDate() + 14);
  const path = `/agreement?appointment_id=${encodeURIComponent(input.appointmentId)}&token=${encodeURIComponent(input.accessToken)}`;

  const { data, error } = await admin
    .from('agreement_requests')
    .insert({
      appointment_id: input.appointmentId,
      customer_id: input.customerId ?? null,
      work_order_id: input.workOrderId ?? null,
      status: 'not_sent',
      token_hash: hashAgreementToken(token),
      token_expires_at: expires.toISOString(),
      secure_path: path,
      created_by: input.createdBy ?? null,
      template_version: 1,
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Could not create agreement request.' };
  }

  const request = mapRequest(data as Record<string, unknown>);
  await syncDenormalizedAgreementStatus(admin, {
    appointmentId: input.appointmentId,
    workOrderId: input.workOrderId,
    requestId: request.id,
    status: 'not_sent',
  });
  await logAgreementEvent(admin, {
    requestId: request.id,
    appointmentId: input.appointmentId,
    customerId: input.customerId,
    eventType: 'agreement_created',
    actorUserId: input.createdBy,
  });

  return {
    ok: true,
    request,
    token,
    url: `${appOrigin()}${path}`,
  };
}

export async function getLatestAgreementRequest(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<AgreementRequestRow | null> {
  const { data } = await admin
    .from('agreement_requests')
    .select('*')
    .eq('appointment_id', appointmentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapRequest(data as Record<string, unknown>) : null;
}

export async function markAgreementViewed(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<void> {
  const latest = await getLatestAgreementRequest(admin, appointmentId);
  if (!latest || latest.status === 'signed' || latest.status === 'verbal') return;
  const now = new Date().toISOString();
  await admin
    .from('agreement_requests')
    .update({ status: 'viewed', viewed_at: latest.viewedAt ?? now, updated_at: now })
    .eq('id', latest.id);
  await syncDenormalizedAgreementStatus(admin, {
    appointmentId,
    requestId: latest.id,
    status: 'viewed',
    viewedAt: latest.viewedAt ?? now,
  });
  await logAgreementEvent(admin, {
    requestId: latest.id,
    appointmentId,
    eventType: 'agreement_opened',
  });
}

export async function markAgreementSigned(
  admin: SupabaseClient,
  input: {
    appointmentId: string;
    signedAgreementId?: string | null;
    signerName?: string | null;
    marketingMediaConsent?: boolean | null;
    smsConsent?: boolean | null;
    mode?: 'signed' | 'verbal';
  },
): Promise<void> {
  const latest = await getLatestAgreementRequest(admin, input.appointmentId);
  const now = new Date().toISOString();
  const status: AgreementStatus = input.mode === 'verbal' ? 'verbal' : 'signed';
  if (latest) {
    await admin
      .from('agreement_requests')
      .update({
        status,
        signed_at: status === 'signed' ? now : latest.signedAt,
        verbal_at: status === 'verbal' ? now : latest.verbalAt,
        signed_agreement_id: input.signedAgreementId ?? null,
        signer_name: input.signerName ?? null,
        marketing_media_consent: input.marketingMediaConsent ?? null,
        sms_consent_selection: input.smsConsent ?? null,
        updated_at: now,
      })
      .eq('id', latest.id);
  }
  await syncDenormalizedAgreementStatus(admin, {
    appointmentId: input.appointmentId,
    requestId: latest?.id ?? null,
    status,
    signedAt: now,
  });
  await logAgreementEvent(admin, {
    requestId: latest?.id,
    appointmentId: input.appointmentId,
    eventType: status === 'verbal' ? 'verbal_acknowledgment_recorded' : 'agreement_signed',
    detail: input.signerName ?? undefined,
  });

  // Cancel pending agreement reminder messages
  try {
    await admin
      .from('scheduled_messages')
      .update({ status: 'canceled', updated_at: now })
      .eq('appointment_id', input.appointmentId)
      .like('rule_key', 'agreement_%')
      .eq('status', 'pending');
  } catch {
    /* table may vary */
  }
}
