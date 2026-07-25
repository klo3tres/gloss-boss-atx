import type { SupabaseClient } from '@supabase/supabase-js';

export type ExternalPaymentMethodKey =
  | 'cash'
  | 'cash_app'
  | 'zelle'
  | 'venmo'
  | 'apple_pay_personal'
  | 'check'
  | 'bank_transfer';

export type ExternalPaymentMethodSetting = {
  enabled: boolean;
  label: string;
  instructions: string;
  proofRequired: boolean;
};

export type ExternalPaymentSettings = Record<ExternalPaymentMethodKey, ExternalPaymentMethodSetting>;

export const EXTERNAL_PAYMENT_SETTINGS_KEY = 'external_payment_methods';

export const DEFAULT_EXTERNAL_PAYMENT_SETTINGS: ExternalPaymentSettings = {
  cash: { enabled: false, label: 'Cash', instructions: 'Pay the technician at your appointment.', proofRequired: false },
  cash_app: { enabled: false, label: 'Cash App', instructions: '', proofRequired: true },
  zelle: { enabled: false, label: 'Zelle', instructions: '', proofRequired: true },
  venmo: { enabled: false, label: 'Venmo', instructions: '', proofRequired: true },
  apple_pay_personal: { enabled: false, label: 'Apple Pay sent directly', instructions: '', proofRequired: true },
  check: { enabled: false, label: 'Check', instructions: '', proofRequired: false },
  bank_transfer: { enabled: false, label: 'Bank transfer', instructions: '', proofRequired: true },
};

const KEYS = Object.keys(DEFAULT_EXTERNAL_PAYMENT_SETTINGS) as ExternalPaymentMethodKey[];

export function parseExternalPaymentSettings(raw: unknown): ExternalPaymentSettings {
  let parsed: unknown = raw;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = null;
    }
  }
  const source = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  const result = structuredClone(DEFAULT_EXTERNAL_PAYMENT_SETTINGS);
  for (const key of KEYS) {
    const row = source[key];
    if (!row || typeof row !== 'object') continue;
    const input = row as Record<string, unknown>;
    result[key] = {
      enabled: input.enabled === true,
      label: String(input.label ?? result[key].label).trim().slice(0, 80) || result[key].label,
      instructions: String(input.instructions ?? '').trim().slice(0, 1000),
      proofRequired: input.proofRequired === true,
    };
  }
  return result;
}

export async function loadExternalPaymentSettings(admin: SupabaseClient): Promise<ExternalPaymentSettings> {
  const { data, error } = await admin
    .from('site_settings')
    .select('value')
    .eq('key', EXTERNAL_PAYMENT_SETTINGS_KEY)
    .maybeSingle();
  if (error || !data) return structuredClone(DEFAULT_EXTERNAL_PAYMENT_SETTINGS);
  return parseExternalPaymentSettings(data.value);
}

export function enabledExternalPaymentMethods(settings: ExternalPaymentSettings) {
  return KEYS
    .filter((key) => settings[key].enabled)
    .map((key) => ({
      key,
      label: settings[key].label,
      instructions: settings[key].instructions,
      proofRequired: settings[key].proofRequired,
    }));
}
