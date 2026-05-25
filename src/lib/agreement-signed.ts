import type { SupabaseClient } from '@supabase/supabase-js';
import type { Row } from '@/lib/work-order-resolve';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function payloadObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** True when legal acknowledgement exists in any durable store (not only signed_agreements). */
export async function resolveAgreementSigned(
  admin: SupabaseClient,
  queryId: string,
  isFallback: boolean,
  row?: Row | null,
): Promise<boolean> {
  if (!queryId) return false;

  const sa = isFallback
    ? await admin.from('signed_agreements').select('id').eq('fallback_booking_id', queryId).limit(1).maybeSingle()
    : await admin.from('signed_agreements').select('id').eq('appointment_id', queryId).limit(1).maybeSingle();
  if (sa.data?.id) return true;

  const ja = isFallback
    ? await admin.from('job_agreements').select('id').eq('fallback_booking_id', queryId).limit(1).maybeSingle()
    : await admin.from('job_agreements').select('id').eq('appointment_id', queryId).limit(1).maybeSingle();
  if (ja.data?.id) return true;

  if (!isFallback) {
    const intake = await admin.from('intake_submissions').select('form_data, agreement_snapshot').eq('appointment_id', queryId).maybeSingle();
    const form = payloadObject((intake.data as Row | null)?.form_data);
    const ack = payloadObject(form.walk_in_legal_ack);
    if (str(ack.signer_legal_name) || str((intake.data as Row | null)?.agreement_snapshot)) return true;
  } else if (row) {
    const payload = payloadObject(row.payload);
    const ack = payloadObject(payload.walk_in_legal_ack);
    if (str(ack.signer_legal_name)) return true;
  }

  return false;
}
