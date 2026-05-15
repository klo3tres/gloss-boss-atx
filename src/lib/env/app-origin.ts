/**
 * Production-safe app origin for Stripe redirects and webhooks.
 * Prefer NEXT_PUBLIC_APP_URL; on Vercel fall back to VERCEL_URL.
 */
export function getAppOrigin(request?: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, '');
    return `https://${host}`;
  }
  if (request) {
    const origin = request.headers.get('origin')?.trim();
    if (origin) return origin.replace(/\/$/, '');
  }
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000';
  }
  return 'https://vercel.app';
}
