/**
 * Production-safe app origin for Stripe redirects and webhooks.
 * Prefer NEXT_PUBLIC_APP_URL; fall back to canonical domain in production.
 */
import { CANONICAL_ORIGIN, configuredAppUrl, resolveProductionAppOrigin } from '@/lib/env/canonical-domain';

export function getAppOrigin(request?: Request): string {
  const configured = configuredAppUrl();
  if (configured && !configured.includes('localhost')) {
    return configured;
  }

  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    return CANONICAL_ORIGIN;
  }

  const resolved = resolveProductionAppOrigin();
  if (resolved !== 'http://localhost:3000') {
    return resolved;
  }

  if (request) {
    const origin = request.headers.get('origin')?.trim();
    if (origin) return origin.replace(/\/$/, '');
  }

  return resolved;
}

/** @deprecated use getAppOrigin — kept for imports */
export { CANONICAL_ORIGIN };
