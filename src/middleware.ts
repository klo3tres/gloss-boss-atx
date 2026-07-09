import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { getPublicSupabaseEnv } from '@/lib/supabase/env';

const PROTECTED = ['/dashboard', '/admin', '/tech', '/customer', '/titan'];

function needsAuth(pathname: string): boolean {
  return PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Auth-only middleware. Domain canonicalization (www ↔ apex, HTTP → HTTPS) is handled
 * by Vercel Domains — do not redirect hosts here or ERR_TOO_MANY_REDIRECTS will occur.
 */
export async function middleware(request: NextRequest) {
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
    '/((?!_next/static|_next/image|api/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
