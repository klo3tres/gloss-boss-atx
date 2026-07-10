import Image from 'next/image';
import Link from 'next/link';
import { Sparkles, Trophy, ShieldCheck, type LucideIcon } from 'lucide-react';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { MembershipsPricingClient } from './memberships-pricing-client';
import { MembershipRoiCalculator } from '@/components/marketing/membership-roi-calculator';

export const dynamic = 'force-dynamic';

const LOGO = '/assets/glossboss_atx_logo.png';
const DRIVEWAY_HERO = '/assets/black_detailer_driveway_1780873080456.png';

const MEMBERSHIP_HIGHLIGHTS: Array<{ title: string; body: string; Icon: LucideIcon }> = [
  { title: 'Member Pricing', body: '10–20% off all detailing packages by tier.', Icon: Sparkles },
  { title: 'Included Credits', body: 'Quarterly detail credits, annual upgrades, and free wash value.', Icon: Trophy },
  { title: 'Priority Scheduling', body: 'Lock in recurring care with dedicated member slots.', Icon: ShieldCheck },
];

interface Plan {
  id: string;
  name: string;
  slug: string;
  tier: string;
  price_cents: number;
  price_weekly_cents: number;
  price_biweekly_cents: number;
  price_monthly_cents: number;
  price_yearly_cents: number;
  discount_percent: number;
  benefits: string[];
  included_services: string[];
  billing_interval: string;
}

const PUBLIC_TIERS = ['bronze', 'silver', 'gold'] as const;

function normalizeTier(plan: Pick<Plan, 'tier' | 'name' | 'slug'>) {
  const hay = `${plan.tier ?? ''} ${plan.name ?? ''} ${plan.slug ?? ''}`.toLowerCase();
  return PUBLIC_TIERS.find((tier) => hay.includes(tier)) ?? null;
}

function publicMembershipPlans(rows: Plan[]) {
  const byTier = new Map<string, Plan>();
  for (const plan of rows) {
    const tier = normalizeTier(plan);
    if (!tier) continue;
    const current = byTier.get(tier);
    const planHasPrice = Boolean(plan.price_monthly_cents || plan.price_biweekly_cents || plan.price_yearly_cents || plan.price_cents);
    const currentHasPrice = current ? Boolean(current.price_monthly_cents || current.price_biweekly_cents || current.price_yearly_cents || current.price_cents) : false;
    if (!current || (planHasPrice && !currentHasPrice)) byTier.set(tier, plan);
  }
  return PUBLIC_TIERS.map((tier) => byTier.get(tier)).filter((plan): plan is Plan => Boolean(plan));
}

export default async function MembershipsPage() {
  const admin = tryCreateAdminSupabase();
  const { data } = admin
    ? await admin.from('membership_plans')
        .select('*')
        .eq('archived', false)
        .or('show_on_homepage.eq.true,show_on_services.eq.true')
    : { data: [] as any[] };
  
  const plans = publicMembershipPlans((data ?? []) as Plan[]);

  return (
    <main className="gb-luxury-page gb-marketing-page min-h-screen pb-24 text-foreground">
      {/* Premium Driveway Hero Banner */}
      <section className="relative w-full min-h-[52vh] sm:h-[60vh] sm:min-h-[480px] flex items-center justify-center overflow-hidden border-b border-gold/15 mb-12 sm:mb-16">
        <Image
          src={DRIVEWAY_HERO}
          alt="Luxury car detailing driveway"
          fill
          priority
          className="object-cover object-center opacity-40 brightness-75 scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-background/80" />

        <div className="relative z-10 max-w-5xl px-6 text-center">
          <div className="flex justify-center mb-6">
            <Image
              src={LOGO}
              alt="Gloss Boss ATX"
              width={280}
              height={100}
              className="h-auto w-56 object-contain sm:w-64"
              priority
            />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-gold">
            Gloss Boss Autocare Subscriptions
          </p>
          <h1 className="mt-4 text-4.5xl font-black uppercase tracking-tight text-foreground sm:text-6xl max-w-3xl mx-auto leading-none">
            RECURRING SHINE FOR LUXURY DRIVES.
          </h1>
          <p className="mt-4 max-w-2xl mx-auto text-sm sm:text-base text-muted-foreground leading-relaxed font-medium">
            Keep your vehicle in showroom condition with tailored maintenance plans — member pricing, included wash credits, and priority scheduling slots.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <a
              href="#pricing-calculator"
              className="rounded-xl bg-gold px-6 py-3.5 text-xs font-black uppercase tracking-wider text-black shadow-[0_0_20px_rgba(212,175,55,0.35)] hover:bg-gold-soft transition"
            >
              Choose Plan
            </a>
            <Link
              href="/book"
              className="rounded-xl border border-border bg-card px-6 py-3.5 text-xs font-black uppercase tracking-wider text-foreground hover:border-gold/40 transition shadow-sm"
            >
              One-Time Booking
            </Link>
          </div>
        </div>
      </section>

      {/* Highlights Grid */}
      <section className="max-w-6xl mx-auto px-6 mb-20">
        <div className="grid gap-6 sm:grid-cols-3">
          {MEMBERSHIP_HIGHLIGHTS.map(({ title, body, Icon }) => (
            <div
              key={title}
              className="rounded-3xl border border-border bg-card p-6 flex flex-col items-center text-center shadow-sm"
            >
              <div className="rounded-2xl bg-gold/10 p-3.5 border border-gold/15">
                <Icon className="h-6 w-6 text-gold-soft" />
              </div>
              <h3 className="mt-4 text-sm font-black uppercase tracking-wider text-foreground">
                {title}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground max-w-[240px]">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 mb-16">
        <MembershipRoiCalculator
          plans={plans.map((p) => ({
            tier: p.tier,
            price_monthly_cents: p.price_monthly_cents || p.price_cents,
            discount_percent: p.discount_percent,
          }))}
        />
      </section>

      {/* Pricing Calculator Section */}
      <section id="pricing-calculator" className="max-w-6xl mx-auto px-6">
        <MembershipsPricingClient plans={plans} />
      </section>
    </main>
  );
}
