'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GLOSS_BOSS_SUPPORT_EMAIL, GLOSS_BOSS_SUPPORT_MAILTO } from '@/lib/branding';
import { SocialLinksFooter, type SocialLinks } from '@/components/marketing/social-links';

export function MarketingSiteFooter({ compact = false }: { compact?: boolean }) {
  const [socialLinks, setSocialLinks] = useState<SocialLinks>({});

  useEffect(() => {
    fetch('/api/public/site-data', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data?.socialLinks) setSocialLinks(data.socialLinks);
      })
      .catch(() => {});
  }, []);

  return (
    <footer className={`border-t border-border bg-card/80 ${compact ? 'mt-12 py-8' : 'py-12'} px-4 sm:px-6`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold-soft">Gloss Boss ATX</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Austin, Texas & surrounding areas ·{' '}
            <a href="tel:+15124812319" className="text-foreground hover:text-gold-soft">
              (512) 481-2319
            </a>
            {' · '}
            <a href={GLOSS_BOSS_SUPPORT_MAILTO} className="text-foreground hover:text-gold-soft">
              {GLOSS_BOSS_SUPPORT_EMAIL}
            </a>
          </p>
          <div className="mt-4">
            <SocialLinksFooter links={socialLinks} />
          </div>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-bold uppercase tracking-wider" aria-label="Legal and site links">
          <Link href="/privacy" className="text-muted-foreground transition hover:text-gold-soft">
            Privacy Policy
          </Link>
          <Link href="/terms" className="text-muted-foreground transition hover:text-gold-soft">
            Terms &amp; Conditions
          </Link>
          <Link href="/book" className="text-gold-soft transition hover:text-foreground">
            Book
          </Link>
          <Link href="/" className="text-muted-foreground transition hover:text-gold-soft">
            Home
          </Link>
        </nav>
      </div>
      <p className="mx-auto mt-6 max-w-7xl text-center text-[10px] text-muted-foreground/70 sm:text-left">
        © {new Date().getFullYear()} Gloss Boss ATX. All rights reserved.
        <span className="mx-2 hidden sm:inline">·</span>
        <span className="mt-2 block sm:mt-0 sm:inline">
          <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-[0.18em] text-muted-foreground/60">
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded border border-border text-[7px] font-black">T</span>
            Powered by Titan™
          </span>
        </span>
      </p>
    </footer>
  );
}
