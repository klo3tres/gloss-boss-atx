/** US mobile booking: store exactly 10 digits (no country code). */

export function digitsOnly(input: string): string {
  return String(input ?? '').replace(/\D/g, '');
}

export type UsPhoneResult =
  | { ok: true; digits10: string }
  | { ok: false; error: string };

export function normalizeUsPhone10Digits(input: string): UsPhoneResult {
  const d = digitsOnly(input);
  if (!d.length) return { ok: false, error: 'Phone number is required.' };
  if (d.length > 10) return { ok: false, error: 'Enter a 10-digit US phone number (no extra digits).' };
  if (d.length < 10) return { ok: false, error: 'Enter a complete 10-digit phone number.' };
  return { ok: true, digits10: d };
}
