import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

export type TitanSetupWarning = {
  id: string;
  message: string;
  href?: string;
  severity: 'info' | 'warning';
};

export function TitanSetupBanner({ warnings }: { warnings: TitanSetupWarning[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2">
      {warnings.map((w) => (
        <div
          key={w.id}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
            w.severity === 'warning'
              ? 'border-amber-500/35 bg-amber-500/10 text-amber-100'
              : 'border-cyan-500/25 bg-cyan-500/5 text-cyan-100'
          }`}
        >
          <p className="text-sm">{w.message}</p>
          {w.href ? (
            <Link
              href={w.href}
              className="shrink-0 text-[10px] font-black uppercase tracking-wide text-white/90 hover:underline"
            >
              Configure →
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function TitanSection({
  title,
  subtitle,
  icon: Icon,
  accent = 'gold',
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  accent?: 'gold' | 'cyan' | 'emerald' | 'violet';
  children: React.ReactNode;
}) {
  const accentClass =
    accent === 'cyan'
      ? 'text-cyan-300'
      : accent === 'emerald'
        ? 'text-emerald-300'
        : accent === 'violet'
          ? 'text-violet-300'
          : 'text-gold-soft';

  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3 border-b border-white/5 pb-3">
        {Icon ? <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${accentClass}`} /> : null}
        <div>
          <h3 className="text-[11px] font-black uppercase tracking-[0.28em] text-white">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm text-zinc-500">{subtitle}</p> : null}
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

export function TitanEmptyState({
  title,
  detail,
  actionLabel,
  actionHref,
}: {
  title: string;
  detail: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-black/30 px-5 py-8 text-center">
      <p className="text-sm font-bold text-zinc-300">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-zinc-500">{detail}</p>
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="mt-4 inline-flex rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-wide text-zinc-300 hover:border-gold/30 hover:text-gold-soft"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function TitanMetricTile({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 font-mono text-2xl font-black text-white">{value}</p>
      {hint ? <p className="mt-1 text-[10px] text-zinc-600">{hint}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group rounded-2xl border border-white/8 bg-zinc-950/60 p-4 transition hover:border-gold/25 hover:bg-zinc-950"
      >
        {inner}
      </Link>
    );
  }

  return <div className="rounded-2xl border border-white/8 bg-zinc-950/60 p-4">{inner}</div>;
}
