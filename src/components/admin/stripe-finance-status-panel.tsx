import type { StripeFinanceSnapshot } from '@/lib/stripe-finance-sync';
import { AlertTriangle, CheckCircle2, CircleDashed } from 'lucide-react';
import Link from 'next/link';

function money(cents: number | null) {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function StatusPill({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === true) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-2 py-1 text-[10px] font-bold uppercase text-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> {label}
      </span>
    );
  }
  if (ok === false) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-950/30 px-2 py-1 text-[10px] font-bold uppercase text-amber-200">
        <AlertTriangle className="h-3 w-3" /> {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-zinc-600/40 bg-zinc-900/50 px-2 py-1 text-[10px] font-bold uppercase text-zinc-400">
      <CircleDashed className="h-3 w-3" /> {label}
    </span>
  );
}

export function StripeFinanceStatusPanel({
  stripeConnected,
  snapshot,
}: {
  stripeConnected: boolean;
  snapshot: StripeFinanceSnapshot | null;
}) {
  const treasuryEnabled = snapshot?.treasuryAvailableCents != null && !snapshot.treasuryUnavailableReason;
  const treasuryDisabled = Boolean(snapshot?.treasuryUnavailableReason);
  const issuingEnabled = snapshot?.recentCardSpends.length ? true : snapshot?.issuingUnavailableReason ? false : null;
  const issuingDisabled = Boolean(snapshot?.issuingUnavailableReason);

  return (
    <div className="rounded-2xl border border-gold/15 bg-black/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Stripe finance status</p>
          <p className="mt-1 text-xs text-zinc-400">
            Live from Stripe API — not inferred from the dashboard UI alone.
          </p>
        </div>
        <StatusPill ok={stripeConnected ? true : false} label={stripeConnected ? 'Stripe connected' : 'Not connected'} />
      </div>

      {!stripeConnected ? (
        <p className="mt-4 text-sm text-amber-200">
          Add your Stripe secret key in Settings. Treasury and Issuing cannot be verified until Stripe is connected.
        </p>
      ) : snapshot ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/40 p-3">
            <p className="text-[10px] uppercase text-zinc-500">Available balance</p>
            <p className="mt-1 font-mono text-lg font-black text-gold-soft">{money(snapshot.paymentAvailableCents)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/40 p-3">
            <p className="text-[10px] uppercase text-zinc-500">Pending balance</p>
            <p className="mt-1 font-mono text-lg font-black text-zinc-200">{money(snapshot.paymentPendingCents)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/40 p-3">
            <p className="text-[10px] uppercase text-zinc-500">Treasury</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusPill
                ok={treasuryEnabled ? true : treasuryDisabled ? false : null}
                label={treasuryEnabled ? 'Enabled' : treasuryDisabled ? 'Not enabled' : 'Unknown'}
              />
              {treasuryEnabled ? (
                <span className="font-mono text-sm text-zinc-200">{money(snapshot.treasuryAvailableCents)}</span>
              ) : null}
            </div>
            {snapshot.treasuryUnavailableReason ? (
              <p className="mt-2 text-[11px] text-zinc-500">{snapshot.treasuryUnavailableReason}</p>
            ) : null}
          </div>
          <div className="rounded-xl border border-white/10 bg-black/40 p-3 sm:col-span-2">
            <p className="text-[10px] uppercase text-zinc-500">Issuing (card spend)</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusPill
                ok={issuingEnabled === true ? true : issuingDisabled ? false : null}
                label={issuingEnabled ? 'Available' : issuingDisabled ? 'Not enabled' : 'Unknown'}
              />
              {snapshot.recentCardSpends.length > 0 ? (
                <span className="text-[11px] text-zinc-400">{snapshot.recentCardSpends.length} recent transactions</span>
              ) : null}
            </div>
            {snapshot.issuingUnavailableReason ? (
              <p className="mt-2 text-[11px] text-zinc-500">{snapshot.issuingUnavailableReason}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-400">Could not load Stripe finance snapshot.</p>
      )}

      <p className="mt-4 rounded-lg border border-white/5 bg-zinc-950/60 p-3 text-[11px] text-zinc-500">
        Stripe Dashboard may show balances even if Treasury/Issuing is not fully enabled in this app. Enable{' '}
        <code className="text-zinc-400">STRIPE_ENABLE_TREASURY_SYNC</code> and{' '}
        <code className="text-zinc-400">STRIPE_ENABLE_ISSUING_SYNC</code> in Vercel only after Stripe confirms those products on your account.
      </p>

      <div className="mt-3 flex flex-wrap gap-3 text-[10px] font-bold uppercase">
        <Link href="/admin/stripe-sync" className="text-gold-soft hover:underline">
          Stripe sync
        </Link>
        <Link href="/admin/card-activity" className="text-zinc-400 hover:text-zinc-200">
          Card activity
        </Link>
      </div>
    </div>
  );
}
