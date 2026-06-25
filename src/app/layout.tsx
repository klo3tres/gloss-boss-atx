import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { getAppOrigin } from '@/lib/env/app-origin';
import { CANONICAL_ORIGIN } from '@/lib/env/canonical-domain';

/** Root layout uses `node:fs` — must stay on Node (never Edge) or SSR can hard-fail → blank page. */
export const runtime = 'nodejs';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

function readHasCssFallback(): boolean {
  try {
    const cssFallbackAbs = path.join(process.cwd(), 'public', 'assets', 'app-layout.css');
    return fs.existsSync(cssFallbackAbs);
  } catch (e) {
    console.warn('[CRM_DEBUG_UI]', 'layout_css_fallback_probe_failed', e instanceof Error ? e.message : e);
    return false;
  }
}

const hasCssFallback = readHasCssFallback();

function resolveMetadataBase(): URL {
  try {
    return new URL(getAppOrigin());
  } catch {
    /* fall through */
  }
  try {
    return new URL(CANONICAL_ORIGIN);
  } catch {
    return new URL('https://glossbossatx.com');
  }
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: 'Gloss Boss ATX | Luxury Automotive Detailing',
  description:
    'Premium mobile detailing in Austin, Texas. Ride Clean. Ride Like A Boss.',
  keywords: [
    'Austin detailing',
    'mobile detailing Austin TX',
    'ceramic coating Austin',
    'luxury car detailing Austin',
    'Gloss Boss ATX',
  ],
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg',
    apple: '/brand/glossboss-clean-logo.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Gloss Boss ATX',
    title: 'Gloss Boss ATX | Luxury Automotive Detailing',
    description: 'Premium mobile detailing in Austin, Texas. Ride Clean. Ride Like A Boss.',
    images: [{ url: '/brand/glossboss-official-atx.png', width: 1200, height: 630, alt: 'Gloss Boss ATX' }],
  },
};

/**
 * Static root only: `html` → `body` → `{children}`. No client imports, no auth, no async.
 * Chrome, error boundary, and diagnostics: `app/template.tsx`.
 */
/**
 * Inline baseline if the main stylesheet fails (stale deploy, blocked chunk, etc.).
 * Uses system UI fonts so the page is never Times New Roman on a black void.
 */
const LAYOUT_BASELINE_CSS = [
  'html,body{min-height:100%;margin:0;background:#000;color:#e4e4e7}',
  'body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased}',
  'a{color:#f1d28a;text-decoration:none}a:hover{color:#d4af37;text-decoration:underline}',
  'button,input,select,textarea{font:inherit;color:inherit}',
  'button{cursor:pointer}',
].join('');

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en' className={`${inter.variable} h-full`} suppressHydrationWarning>
      {/*
        Do not render a manual <head> here. Next.js App Router merges metadata and injects
        `/_next/static/css/*.css` into the document head automatically. A custom <head> sibling
        can prevent those links from being emitted, leaving the page unstyled (raw HTML + Times).
        Optional Tailwind bundle fallback lives in <body> (valid HTML5 for stylesheet links).
      */}
      <body className='min-h-full bg-background font-sans text-foreground antialiased'>
        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'Gloss Boss ATX',
              url: 'https://glossbossatx.com',
              logo: 'https://glossbossatx.com/brand/glossboss-clean-logo.png',
            }),
          }}
        />
        <style dangerouslySetInnerHTML={{ __html: LAYOUT_BASELINE_CSS }} />
        {hasCssFallback ? (
          <link rel='stylesheet' href='/assets/app-layout.css' data-gb='tailwind-fallback' />
        ) : null}
        <noscript>
          <div
            style={{
              padding: 24,
              fontFamily: 'system-ui,Segoe UI,sans-serif',
              background: '#000000',
              color: '#e4e4e7',
              minHeight: '100vh',
            }}
          >
            <p style={{ fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#d4af37' }}>Gloss Boss ATX</p>
            <p style={{ marginTop: 12, maxWidth: 520, lineHeight: 1.6 }}>
              This site needs JavaScript enabled. Turn JavaScript on and refresh, or open{' '}
              <a href='mailto:glossbossatx1@gmail.com' style={{ color: '#f1d28a' }}>
                glossbossatx1@gmail.com
              </a>
              .
            </p>
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}
