import type { CustomerIntelligence } from '@/lib/titan/customer-intelligence';
import { displayMoney } from '@/lib/display-format';

export function CustomerIntelligencePanel({ intel }: { intel: CustomerIntelligence }) {
  return (
    <section className="rounded-3xl border border-gold/20 bg-gradient-to-br from-gold/5 via-card to-card p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Titan customer intelligence</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Lifetime value', value: intel.revenueGeneratedLabel },
          { label: 'Avg spend', value: displayMoney(intel.avgSpendCents) },
          { label: 'Visits', value: String(intel.visitCount) },
          { label: 'Avg days between', value: intel.avgDaysBetweenVisits != null ? `${intel.avgDaysBetweenVisits}d` : '—' },
          { label: 'Membership fit', value: `${intel.membershipProbability}%` },
          { label: 'Referral fit', value: `${intel.referralProbability}%` },
          { label: 'Loyalty', value: intel.loyaltyProgress },
          { label: 'Open opps', value: String(intel.openOpportunities) },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-border bg-card/80 px-3 py-2.5">
            <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">{m.label}</p>
            <p className="mt-1 text-sm font-black text-foreground">{m.value}</p>
          </div>
        ))}
      </div>
      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Primary vehicle</dt>
          <dd className="font-semibold text-foreground">{intel.primaryVehicle ?? 'Not on file'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Next recommended service</dt>
          <dd className="font-semibold text-foreground capitalize">{intel.nextRecommendedService}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ceramic</dt>
          <dd className="font-semibold text-foreground">{intel.ceramicStatus}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last visit</dt>
          <dd className="font-semibold text-foreground">{intel.lastVisitLabel}</dd>
        </div>
      </dl>
      <p className="mt-4 rounded-xl border border-gold/15 bg-gold/5 px-3 py-2.5 text-xs leading-relaxed text-foreground">
        <span className="font-black text-gold-soft">Recommend {intel.recommendedMembershipTier}: </span>
        {intel.membershipPitch}
      </p>
    </section>
  );
}
