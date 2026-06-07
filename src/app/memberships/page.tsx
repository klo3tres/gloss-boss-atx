import Image from 'next/image';
import Link from 'next/link';
import { Sparkles, Trophy, ShieldCheck, type LucideIcon } from 'lucide-react';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { MembershipsPricingClient } from './memberships-pricing-client';

export const dynamic = 'force-dynamic';

const LOGO = '/assets/glossboss_atx_logo.png';
const DRIVEWAY_HERO = '/assets/black_detailer_driveway_1780873080456.png';

const MEMBERSHIP_HIGHLIGHTS: Array<{ title: string; body: string; Icon: LucideIcon }> = [
  { title: 'Member Pricing', body: 'Automatic discounts on all detailing packages.', Icon: Sparkles },
  { title: 'Loyalty Multiplier', body: 'Earn stamps faster and unlock rewards.', Icon: Trophy },
  { title: 'Priority Scheduling', body: 'Lock in recurring care with dedicated slots.', Icon: ShieldCheck },
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

export default async function MembershipsPage() {
  const admin = tryCreateAdminSupabase();
  const { data } = admin
    ? await admin.from('membership_plans')
        .select('*')
        .eq('archived', false)
        .or('show_on_homepage.eq.true,show_on_services.eq.true')
    : { data: [] as any[] };
  
  const plans = (data ?? []) as Plan[];

  return (
    <main className="gb-luxury-page min-h-screen bg-black pb-24 text-foreground">
      {/* Premium Driveway Hero Banner */}
      <section className="relative w-full h-[60vh] min-h-[480px] flex items-center justify-center overflow-hidden border-b border-gold/15 mb-16">
        <Image
          src={DRIVEWAY_HERO}
          alt="Luxury car detailing driveway"
          fill
          priority
          className="object-cover object-center opacity-40 brightness-75 scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-transparent to-black" />

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
          <h1 className="mt-4 text-4.5xl font-black uppercase tracking-tight text-white sm:text-6xl max-w-3xl mx-auto leading-none">
            RECURRING SHINE FOR LUXURY DRIVES.
          </h1>
          <p className="mt-4 max-w-2xl mx-auto text-sm sm:text-base text-zinc-300 leading-relaxed font-medium">
            Keep your vehicle in showroom condition with our tailored maintenance plans. Lock in guaranteed pricing, priority scheduling slots, and double loyalty points.
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
              className="rounded-xl border border-white/20 bg-black/60 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-white hover:bg-white/5 transition"
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
              className="rounded-3xl border border-white/5 bg-zinc-950/60 p-6 flex flex-col items-center text-center backdrop-blur-sm"
            >
              <div className="rounded-2xl bg-gold/10 p-3.5 border border-gold/15">
                <Icon className="h-6 w-6 text-gold-soft" />
              </div>
              <h3 className="mt-4 text-sm font-black uppercase tracking-wider text-white">
                {title}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400 max-w-[240px]">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing Calculator Section */}
      <section id="pricing-calculator" className="max-w-6xl mx-auto px-6">
        <MembershipsPricingClient plans={plans} />
      </section>
    </main>
  );
}
