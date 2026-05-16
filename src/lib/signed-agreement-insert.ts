import type { SupabaseClient } from '@supabase/supabase-js';

function isSchemaDriftMessage(msg: string): boolean {
  return /column|does not exist|schema cache|Could not find|PGRST204/i.test(msg);
}

function cloneRow(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row };
}

/**
 * Inserts into `signed_agreements` with several lean shapes so transient PostgREST
 * drift or optional FK columns do not block checkout / walk-in signing.
 */
export async function insertSignedAgreementFlexible(
  admin: SupabaseClient,
  base: Record<string, unknown>,
): Promise<{ error: { message: string } | null }> {
  const snap = base.agreement_snapshot;
  const snapshotText = typeof snap === 'string' ? snap : snap != null ? String(snap) : '';

  const variants: Record<string, unknown>[] = [];

  variants.push(cloneRow(base));

  const lean = cloneRow(base);
  delete lean.customer_id;
  delete lean.vehicle_id;
  delete lean.technician_id;
  variants.push(lean);

  const leanNoTemplate = cloneRow(lean);
  delete leanNoTemplate.template_id;
  delete leanNoTemplate.template_version;
  variants.push(leanNoTemplate);

  const minimal: Record<string, unknown> = {
    appointment_id: base.appointment_id,
    signer_legal_name: base.signer_legal_name,
    signature_type: base.signature_type,
    signature_data: base.signature_data ?? null,
    agreement_snapshot: snapshotText || ' ',
    template_id: base.template_id ?? null,
    template_version: base.template_version ?? 1,
  };
  for (const key of [
    'sms_consent',
    'sms_consent_at',
    'sms_consent_text',
    'sms_consent_phone',
    'technician_witness_id',
    'technician_witness_name',
    'technician_witness_role',
    'technician_witnessed_at',
  ]) {
    if (key in base) minimal[key] = base[key];
  }
  variants.push(minimal);

  const minimalNoTemplate = { ...minimal };
  delete minimalNoTemplate.template_id;
  delete minimalNoTemplate.template_version;
  variants.push(minimalNoTemplate);

  let lastMsg = 'insert failed';
  const seen = new Set<string>();

  for (const row of variants) {
    const key = JSON.stringify(Object.keys(row).sort());
    if (seen.has(key)) continue;
    seen.add(key);

    const { error } = await admin.from('signed_agreements').insert(row);
    if (!error) return { error: null };
    lastMsg = error.message;
    if (!isSchemaDriftMessage(error.message)) {
      return { error: { message: error.message } };
    }
  }

  return { error: { message: lastMsg } };
}

export async function insertJobAgreementFlexible(
  admin: SupabaseClient,
  base: Record<string, unknown>,
): Promise<{ error: { message: string } | null }> {
  const variants = [cloneRow(base), (() => {
    const v = cloneRow(base);
    delete v.template_id;
    delete v.template_version;
    return v;
  })()];

  let lastMsg = '';
  for (const row of variants) {
    const { error } = await admin.from('job_agreements').insert(row);
    if (!error) return { error: null };
    lastMsg = error.message;
    if (!isSchemaDriftMessage(error.message)) return { error: { message: error.message } };
  }
  return { error: { message: lastMsg || 'job_agreements insert failed' } };
}
