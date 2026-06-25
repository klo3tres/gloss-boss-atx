import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { getPublicSupabaseEnv } from '@/lib/supabase/env';
import {
  CANONICAL_HOST,
  isLocalDevHost,
  isVercelPreviewHost,
  shouldSkipCanonicalRedirect,
} from '@/lib/env/canonical-domain';

const PROTECTED = ['/dashboard', '/admin', '/tech', '/customer'];

function needsAuth(pathname: string): boolean {
  return PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Force HTTPS and canonical apex host in production.
 * Skips localhost and *.vercel.app preview deploys.
 */
function canonicalHostRedirect(request: NextRequest): NextResponse | null {
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (!isProd) return null;

  const hostHeader = request.headers.get('host') ?? '';
  const host = hostHeader.split(':')[0]?.toLowerCase() ?? '';
  if (!host || shouldSkipCanonicalRedirect(host)) return null;

  const proto = request.headers.get('x-forwarded-proto')?.toLowerCase() ?? request.nextUrl.protocol.replace(':', '');
  const path = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  const needsHttps = proto !== 'https';
  const isWww = host === `www.${CANONICAL_HOST}`;
  const isWrongHost = host !== CANONICAL_HOST && !isWww && !isVercelPreviewHost(host) && !isLocalDevHost(host);

  if (!needsHttps && !isWww && !isWrongHost) return null;

  const target = new URL(`https://${CANONICAL_HOST}${path}`);
  return NextResponse.redirect(target, 308);
}

export async function middleware(request: NextRequest) {
  const canonical = canonicalHostRedirect(request);
  if (canonical) return canonical;

  try {
    const env = getPublicSupabaseEnv();

    let response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    if (!env) {
      return response;
    }

    const supabase = createServerClient(env.url, env.anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;
    if (!needsAuth(pathname)) {
      return response;
    }

    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', `${pathname}${request.nextUrl.search ?? ''}`);
      return NextResponse.redirect(url);
    }

    return response;
  } catch (e) {
    console.error('[middleware] Supabase session refresh failed — continuing without redirect.', e);
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }
}

export const config = {
  matcher: [
    /*
     * Skip: static assets, images, API (no cookie refresh needed here), favicon.
     * Forwarding request headers on `NextResponse.next` is required for correct RSC/CSS in App Router + Supabase.
     */
    '/((?!_next/static|_next/image|api/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
