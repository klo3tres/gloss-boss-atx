import Link from 'next/link';
import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  primaryAction,
  secondaryAction,
  icon,
}: {
  title: string;
  description: string;
  primaryAction?: { label: string; href?: string; onClick?: () => void };
  secondaryAction?: { label: string; href: string };
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card/60 px-6 py-10 text-center">
      {icon ? <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-muted/50 text-muted-foreground">{icon}</div> : null}
      <p className="text-sm font-black text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {primaryAction ? (
          primaryAction.href ? (
            <Link href={primaryAction.href} className="rounded-xl bg-gold px-4 py-2.5 text-[10px] font-black uppercase text-black">
              {primaryAction.label}
            </Link>
          ) : (
            <button type="button" onClick={primaryAction.onClick} className="rounded-xl bg-gold px-4 py-2.5 text-[10px] font-black uppercase text-black">
              {primaryAction.label}
            </button>
          )
        ) : null}
        {secondaryAction ? (
          <Link href={secondaryAction.href} className="rounded-xl border border-border px-4 py-2.5 text-[10px] font-black uppercase text-muted-foreground">
            {secondaryAction.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
