import type { CustomerIntelligence } from '@/lib/titan/customer-intelligence';
import { displayMoney } from '@/lib/display-format';

function ProbCard({
  label,
  pct,
  reason,
}: {
  label: string;
  pct: number;
  reason: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/80 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm font-black tabular-nums text-foreground">{pct}%</p>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{reason}</p>
    </div>
  );
}

export function CustomerIntelligencePanel({ intel }: { intel: CustomerIntelligence }) {
  return (
    <section className="rounded-3xl border border-gold/20 bg-gradient-to-br from-gold/5 via-card to-card p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Titan customer intelligence</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Lifetime value', value: intel.revenueGeneratedLabel },
          { label: 'Avg spend', value: displayMoney(intel.avgSpendCents) },
          { label: 'Visits', value: String(intel.visitCount) },
          {
            label: 'Avg days between',
            value: intel.avgDaysBetweenVisits != null ? `${intel.avgDaysBetweenVisits}d` : '—',
          },
          {
            label: 'Avg service length',
            value: intel.avgServiceLengthMinutes != null ? `${intel.avgServiceLengthMinutes} min` : '—',
          },
          { label: 'Projected annual', value: intel.projectedAnnualRevenueLabel },
          { label: 'Outstanding', value: intel.outstandingBalanceLabel },
          { label: 'Loyalty', value: intel.loyaltyProgress },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-border bg-card/80 px-3 py-2.5">
            <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">{m.label}</p>
            <p className="mt-1 text-sm font-black text-foreground">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ProbCard label="Membership probability" pct={intel.membershipProbability} reason={intel.membershipReason} />
        <ProbCard label="Referral probability" pct={intel.referralProbability} reason={intel.referralReason} />
        <ProbCard label="Review probability" pct={intel.reviewProbability} reason={intel.reviewReason} />
        <ProbCard label="Upsell probability" pct={intel.upsellProbability} reason={intel.upsellReason} />
      </div>

      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Primary vehicle</dt>
          <dd className="font-semibold text-foreground">{intel.primaryVehicle ?? 'Not on file'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Next recommended service</dt>
          <dd className="font-semibold capitalize text-foreground">{intel.nextRecommendedService}</dd>
          <dd className="mt-0.5 text-[11px] text-muted-foreground">{intel.nextServiceReason}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ceramic</dt>
          <dd className="font-semibold text-foreground">{intel.ceramicStatus}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last visit</dt>
          <dd className="font-semibold text-foreground">{intel.lastVisitLabel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last contact</dt>
          <dd className="font-semibold text-foreground">{intel.lastContactLabel}</dd>
          {intel.lastMessagePreview ? (
            <dd className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{intel.lastMessagePreview}</dd>
          ) : null}
        </div>
        <div>
          <dt className="text-muted-foreground">Open opportunities</dt>
          <dd className="font-semibold text-foreground">{intel.openOpportunities}</dd>
        </div>
      </dl>

      <p className="mt-4 rounded-xl border border-gold/15 bg-gold/5 px-3 py-2.5 text-xs leading-relaxed text-foreground">
        <span className="font-black text-gold-soft">Recommend {intel.recommendedMembershipTier}: </span>
        {intel.membershipPitch}
      </p>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Expected annual value if member: <span className="font-semibold text-foreground">{intel.expectedMemberAnnualValueLabel}</span>
      </p>
    </section>
  );
}
