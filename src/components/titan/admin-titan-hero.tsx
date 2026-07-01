'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { TitanPageShell } from '@/components/titan/titan-page-shell';

const actionClass =
  'inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-3 text-[10px] font-black uppercase text-zinc-200 hover:border-gold/30';
const primaryClass =
  'inline-flex items-center gap-1.5 rounded-xl bg-gold px-5 py-3 text-[10px] font-black uppercase text-black hover:brightness-110';

export function AdminTitanHero({
  title,
  sentence,
  kpi,
  kpiHint,
  primaryHref,
  primaryLabel,
  secondaryLinks,
  children,
}: {
  title: string;
  sentence: string;
  kpi: ReactNode;
  kpiHint?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryLinks?: { href: string; label: string }[];
  children?: ReactNode;
}) {
  return (
    <TitanPageShell
      title={title}
      sentence={sentence}
      kpi={kpi}
      kpiHint={kpiHint}
      primaryAction={
        primaryHref && primaryLabel ? (
          <Link href={primaryHref} className={primaryClass}>
            {primaryLabel}
          </Link>
        ) : undefined
      }
      secondaryActions={
        secondaryLinks?.length ? (
          <>
            {secondaryLinks.map((link) => (
              <Link key={link.href} href={link.href} className={actionClass}>
                {link.label}
              </Link>
            ))}
          </>
        ) : undefined
      }
    >
      {children}
    </TitanPageShell>
  );
}
