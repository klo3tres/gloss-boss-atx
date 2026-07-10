import type { NextResponse } from 'next/server';

/** Security headers applied to every HTML/API response. TLS encrypts data in transit; Supabase encrypts at rest. */
export function applySecurityHeaders(response: NextResponse, isProduction = process.env.NODE_ENV === 'production') {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  if (isProduction) {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  return response;
}
