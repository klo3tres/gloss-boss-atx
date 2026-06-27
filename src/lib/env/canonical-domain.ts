/**
 * Production app URL helpers for Gloss Boss ATX.
 * Canonical production host: www.glossbossatx.com (Vercel Domains handles apex → www).
 * App code must NOT redirect between apex and www.
 */

export const EXPECTED_APP_URL = 'https://www.glossbossatx.com';

export const APEX_HOST = 'glossbossatx.com';

export const CANONICAL_HOST = (process.env.CANONICAL_HOST?.trim() || 'www.glossbossatx.com').toLowerCase();

export const CANONICAL_ORIGIN = `https://${CANONICAL_HOST.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;

/** www host — avoids double www when CANONICAL_HOST already includes www */
export const WWW_HOST = CANONICAL_HOST.startsWith('www.') ? CANONICAL_HOST : `www.${CANONICAL_HOST}`;

export function isLocalDevHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost');
}

export function isVercelPreviewHost(host: string): boolean {
  return host.toLowerCase().endsWith('.vercel.app');
}

export function shouldSkipCanonicalRedirect(host: string): boolean {
  return isLocalDevHost(host) || isVercelPreviewHost(host);
}

export function normalizeAppUrl(raw: string | undefined | null): string | null {
  const v = raw?.trim().replace(/\/$/, '');
  return v || null;
}

export function configuredAppUrl(): string | null {
  return normalizeAppUrl(process.env.NEXT_PUBLIC_APP_URL);
}

export function resolveProductionAppOrigin(): string {
  const configured = configuredAppUrl();
  if (configured && !configured.includes('localhost')) {
    return configured;
  }
  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    return EXPECTED_APP_URL;
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, '');
    return `https://${host}`;
  }
  return 'http://localhost:3000';
}

export type AppUrlValidation = {
  ok: boolean;
  configured: string | null;
  expected: string;
  issues: string[];
};

export function validateAppUrlConfig(): AppUrlValidation {
  const configured = configuredAppUrl();
  const expected = EXPECTED_APP_URL;
  const issues: string[] = [];

  if (!configured) {
    issues.push(`NEXT_PUBLIC_APP_URL is not set — set exactly ${expected} in Vercel Production.`);
  } else if (configured !== expected) {
    issues.push(`NEXT_PUBLIC_APP_URL must be exactly ${expected} (currently ${configured}).`);
  }

  return { ok: issues.length === 0, configured, expected, issues };
}
