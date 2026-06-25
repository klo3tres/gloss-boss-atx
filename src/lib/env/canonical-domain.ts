/**
 * Production canonical domain for Gloss Boss ATX.
 * Apex (glossbossatx.com) is canonical; www redirects here once SSL is valid on both hosts.
 */

export const CANONICAL_HOST = (process.env.CANONICAL_HOST?.trim() || 'glossbossatx.com').toLowerCase();

export const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;

export const WWW_HOST = `www.${CANONICAL_HOST}`;

export function isLocalDevHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost');
}

export function isVercelPreviewHost(host: string): boolean {
  return host.toLowerCase().endsWith('.vercel.app');
}

/** Hosts that should not be forced to canonical (local dev + Vercel previews). */
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
    return CANONICAL_ORIGIN;
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
  const expected = CANONICAL_ORIGIN;
  const issues: string[] = [];

  if (!configured) {
    issues.push('NEXT_PUBLIC_APP_URL is not set — emails, Stripe redirects, and webhooks may use wrong domain.');
  } else if (configured.includes('localhost')) {
    issues.push('NEXT_PUBLIC_APP_URL points to localhost — must be the live HTTPS domain in production.');
  } else if (configured.includes('.vercel.app')) {
    issues.push('NEXT_PUBLIC_APP_URL is a Vercel preview URL — set to https://glossbossatx.com in production.');
  } else if (!configured.startsWith('https://')) {
    issues.push('NEXT_PUBLIC_APP_URL must use HTTPS in production.');
  } else {
    try {
      const host = new URL(configured).host.toLowerCase();
      if (host === WWW_HOST) {
        issues.push(`NEXT_PUBLIC_APP_URL uses www — canonical is https://${CANONICAL_HOST}`);
      } else if (host !== CANONICAL_HOST) {
        issues.push(`NEXT_PUBLIC_APP_URL host "${host}" does not match canonical ${CANONICAL_HOST}.`);
      }
    } catch {
      issues.push('NEXT_PUBLIC_APP_URL is not a valid URL.');
    }
  }

  return { ok: issues.length === 0, configured, expected, issues };
}
