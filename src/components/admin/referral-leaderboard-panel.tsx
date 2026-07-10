import { displayMoney } from '@/lib/display-format';

export type ReferralLeaderboardRow = {
  customerId: string;
  name: string;
  completedReferrals: number;
  pendingReferrals: number;
  rewardsEarnedCents: number;
};

export function ReferralLeaderboardPanel({ rows }: { rows: ReferralLeaderboardRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No referral activity yet — customers get codes when added to CRM.</p>
    );
  }

  return (
    <ol className="space-y-2">
      {rows.map((row, idx) => (
        <li key={row.customerId} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/80 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-xs font-black text-foreground">
              #{idx + 1} {row.name}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {row.completedReferrals} completed · {row.pendingReferrals} pending
            </p>
          </div>
          <p className="shrink-0 text-xs font-mono font-black text-gold-soft">{displayMoney(row.rewardsEarnedCents)}</p>
        </li>
      ))}
    </ol>
  );
}
