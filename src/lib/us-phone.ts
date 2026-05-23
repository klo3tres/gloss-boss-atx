/** US phone normalization — store 10 digits in CRM; send SMS as E.164. */

export function digitsOnly(input: string): string {
  return String(input ?? '').replace(/\D/g, '');
}

export type UsPhoneResult =
  | { ok: true; digits10: string; e164: string; display: string }
  | { ok: false; error: string };

const PLACEHOLDER_TEST_NUMBERS = new Set(['5125551212', '5555555555', '5551212']);

/** Reject obvious demo placeholders if user did not change the field. */
export function isDemoPlaceholderPhone(input: string): boolean {
  const d = digitsOnly(input);
  return PLACEHOLDER_TEST_NUMBERS.has(d) || d === '5125551212';
}

export function normalizeUsPhone10Digits(input: string): UsPhoneResult {
  const e164Result = normalizeToE164(input);
  if (!e164Result.ok) return e164Result;
  const digits10 = e164Result.digits10;
  return { ok: true, digits10, e164: e164Result.e164, display: e164Result.display };
}

/** Normalize to E.164 for Twilio (US default +1). */
export function normalizeToE164(input: string): UsPhoneResult {
  let d = digitsOnly(input);
  if (!d.length) return { ok: false, error: 'Phone number is required.' };

  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  if (d.length > 11) return { ok: false, error: 'Enter a valid US phone number (10 digits).' };
  if (d.length < 10) return { ok: false, error: 'Enter a complete 10-digit US phone number.' };

  const digits10 = d.slice(-10);
  const e164 = `+1${digits10}`;
  const display = `+1 (${digits10.slice(0, 3)}) ${digits10.slice(3, 6)}-${digits10.slice(6)}`;
  return { ok: true, digits10, e164, display };
}
