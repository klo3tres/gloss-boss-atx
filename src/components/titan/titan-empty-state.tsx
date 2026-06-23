import Link from 'next/link';

export function TitanEmptyState({
  title,
  reason,
  missing,
  nextStep,
  href,
  actionLabel = 'Fix setup',
}: {
  title: string;
  reason: string;
  missing?: string;
  nextStep: string;
  href?: string;
  actionLabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/12 bg-zinc-950/40 px-4 py-5 text-sm">
      <p className="font-bold text-zinc-200">{title}</p>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500">{reason}</p>
      {missing ? (
        <p className="mt-2 text-[10px] font-mono text-amber-200/80">Missing: {missing}</p>
      ) : null}
      <p className="mt-3 text-xs text-emerald-200/90">→ {nextStep}</p>
      {href ? (
        <Link
          href={href}
          className="mt-3 inline-flex rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black uppercase text-emerald-200"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
