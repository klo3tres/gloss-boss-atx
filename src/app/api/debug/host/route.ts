import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/** Public host diagnostic — no auth. Use to debug redirect / SSL issues in production. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('host') ?? '';
  const forwardedHost = request.headers.get('x-forwarded-host') ?? '';
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? '';

  return NextResponse.json({
    host,
    protocol: forwardedProto || url.protocol.replace(':', ''),
    pathname: url.pathname,
    xForwardedHost: forwardedHost,
    xForwardedProto: forwardedProto,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
    deploymentUrl: process.env.VERCEL_URL ?? null,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
    note: 'Domain redirects (www ↔ apex) are configured in Vercel Domains only — not in app middleware.',
  });
}
