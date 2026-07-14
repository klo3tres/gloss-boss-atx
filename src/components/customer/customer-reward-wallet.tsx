import Link from 'next/link';
import { Clock3, Gift, LockKeyhole, WalletCards } from 'lucide-react';

export type CustomerRewardWalletItem = {
  id: string;
  source: string;
  title: string;
  valueLabel: string;
  status: string;
  expiresAt: string | null;
  usable: boolean;
  terms?: string | null;
};

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function CustomerRewardWallet({ items }: { items: CustomerRewardWalletItem[] }) {
  const available = items.filter((item) => item.usable);
  const pending = items.filter((item) => !item.usable && ['pending', 'pending_completion'].includes(item.status));
  const history = items.filter((item) => !item.usable && !pending.some((pendingItem) => pendingItem.id === item.id));

  return (
    <section className="rounded-3xl border border-gold/20 bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft"><WalletCards className="h-4 w-4" /> Reward wallet</p>
          <h2 className="mt-2 text-2xl font-black text-foreground">Your Gloss Boss rewards</h2>
          <p className="mt-1 text-sm text-muted-foreground">Only available rewards can be used during booking.</p>
        </div>
        <Link href="/book" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gold px-5 text-xs font-black uppercase text-black">Book with a reward</Link>
      </div>

      {items.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No rewards yet. Loyalty punches, referrals, membership credits, and promotions will appear here.</div>
      ) : (
        <div className="mt-5 space-y-5">
          {[{ label: 'Available', rows: available }, { label: 'Pending', rows: pending }, { label: 'History', rows: history }].map((group) => group.rows.length ? (
            <div key={group.label}>
              <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">{group.label}</p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.rows.map((reward) => (
                  <article key={reward.id} className={`rounded-2xl border p-4 ${reward.usable ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-muted/30'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className={`rounded-xl p-2 ${reward.usable ? 'bg-emerald-500/15 text-emerald-300' : 'bg-muted text-muted-foreground'}`}>{reward.usable ? <Gift className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}</span>
                        <div className="min-w-0"><p className="font-bold text-foreground">{reward.title}</p><p className="mt-1 text-[10px] font-black uppercase text-muted-foreground">{reward.source}</p></div>
                      </div>
                      <span className="shrink-0 rounded-full border border-border px-2 py-1 text-[9px] font-black uppercase text-muted-foreground">{statusLabel(reward.status)}</span>
                    </div>
                    <p className="mt-4 font-mono text-2xl font-black text-gold-soft">{reward.valueLabel}</p>
                    {reward.expiresAt ? <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> Expires {new Date(reward.expiresAt).toLocaleDateString()}</p> : <p className="mt-2 text-xs text-muted-foreground">No expiration</p>}
                    {reward.terms ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{reward.terms}</p> : null}
                    {reward.usable ? <Link href="/book" className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-gold/30 text-[10px] font-black uppercase text-gold-soft">Book now</Link> : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null)}
        </div>
      )}
    </section>
  );
}
