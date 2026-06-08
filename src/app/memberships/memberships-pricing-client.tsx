'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, Zap, HelpCircle } from 'lucide-react';
import { MembershipJoinButton } from './membership-join-button';

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

export function MembershipsPricingClient({ plans }: { plans: Plan[] }) {
  const [interval, setInterval] = useState<'biweekly' | 'monthly' | 'yearly'>('monthly');
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const getPrice = (plan: Plan) => {
    let price = 0;
    if (interval === 'biweekly') price = plan.price_biweekly_cents;
    else if (interval === 'yearly') price = plan.price_yearly_cents;
    else price = plan.price_monthly_cents;

    if (!price || price <= 0) {
      price = plan.price_cents;
    }
    return price;
  };

  const getIntervalLabel = () => {
    if (interval === 'biweekly') return '2 weeks';
    if (interval === 'yearly') return 'year';
    return 'month';
  };

  const tone = (tier: string) => {
    const t = tier.toLowerCase();
    if (t.includes('silver')) {
      return {
        bg: 'from-zinc-900/90 via-black to-zinc-950/90 border-zinc-700/50 shadow-zinc-950/50',
        text: 'text-zinc-300',
        badge: 'bg-zinc-800 text-zinc-300 border-zinc-600',
        buttonClass: 'border-zinc-600 hover:border-zinc-400 text-white',
        highlight: 'border-zinc-600/30'
      };
    }
    if (t.includes('gold') || t.includes('platinum')) {
      return {
        bg: 'from-amber-950/40 via-black to-zinc-950 border-gold/40 shadow-gold/5',
        text: 'text-gold-soft',
        badge: 'bg-gold/20 text-gold-soft border-gold/40',
        buttonClass: 'bg-gold text-black hover:bg-gold-soft',
        highlight: 'border-gold/30'
      };
    }
    return {
      bg: 'from-bronze/10 via-black to-zinc-950 border-amber-800/40 shadow-amber-950/20',
      text: 'text-amber-600',
      badge: 'bg-amber-900/30 text-amber-200 border-amber-800/50',
      buttonClass: 'border-amber-800 hover:border-amber-700 text-white',
      highlight: 'border-amber-900/20'
    };
  };

  const faqs = [
    {
      q: 'How does the billing interval work?',
      a: 'Depending on your selection, you can pay weekly, bi-weekly, monthly, or yearly. Bi-weekly billing schedules detailing visits every two weeks, whereas monthly plans charge once per calendar month and secure priority reservation slots.'
    },
    {
      q: 'Can I change my billing interval later?',
      a: 'Absolutely. You can switch your billing frequency (e.g. from monthly to yearly to save) anytime in your Customer Portal settings, or contact your assigned technician directly to align schedules.'
    },
    {
      q: 'Can I apply my membership to multiple vehicles?',
      a: 'Memberships are registered per-vehicle to ensure accurate service history and tailored paint protection plans. However, we offer a 15% discount for additional vehicles registered under the same account!'
    },
    {
      q: 'What is the loyalty digital punch card benefit?',
      a: 'Every detail service you receive earns you loyalty stamps. Membership holders earn stamps at an accelerated rate (2x for Silver, 3x for Gold), allowing you to unlock free add-ons, ceramic upgrades, or complimentary exterior washes faster.'
    },
    {
      q: 'Is there a minimum commitment or cancellation fee?',
      a: 'We believe in flexibility. There are no lock-in contracts; you can pause or cancel your recurring membership at any time with no penalties. Cancellation fee waivers are standard benefits for Gold tier members.'
    }
  ];

  return (
    <div className="w-full">
      {/* Interval Selector Section */}
      <div className="flex justify-center mb-16">
        <div className="inline-flex rounded-2xl border border-white/10 bg-black/60 p-1.5 backdrop-blur-md shadow-[0_0_25px_rgba(0,0,0,0.5)]">
          {(['biweekly', 'monthly', 'yearly'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setInterval(mode)}
              className={`rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all duration-300 ${
                interval === mode
                  ? 'bg-gold text-black shadow-[0_0_15px_rgba(212,175,55,0.3)]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {mode === 'biweekly' ? 'Bi-Weekly' : mode}
              {mode === 'yearly' && (
                <span className="ml-1.5 rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[9px] text-emerald-300 border border-emerald-500/30">
                  Save ~15%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid gap-8 md:grid-cols-3 max-w-6xl mx-auto mb-24">
        {plans.map((p) => {
          const colors = tone(p.tier);
          const currentPrice = getPrice(p);
          const benefits = p.benefits || [];
          const included = p.included_services || [];

          return (
            <article
              key={p.id}
              className={`relative flex flex-col rounded-3xl border bg-gradient-to-br p-6 sm:p-8 transition-all duration-500 hover:-translate-y-1.5 ${colors.bg} hover:border-gold/30 hover:shadow-[0_0_40px_rgba(212,175,55,0.08)]`}
            >
              {p.tier.toLowerCase().includes('gold') && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gold px-4 py-1 text-[10px] font-black uppercase tracking-widest text-black shadow-[0_0_15px_rgba(212,175,55,0.4)]">
                  Most Popular
                </div>
              )}

              <div className="mb-6">
                <span className={`inline-flex rounded-lg border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${colors.badge}`}>
                  {p.tier}
                </span>
                <h3 className="mt-3 text-2.5xl font-black uppercase text-white tracking-tight">
                  {p.name}
                </h3>
                <p className="mt-1 text-xs text-zinc-400">Precision gloss maintenance</p>
              </div>

              <div className="mb-6 border-t border-white/5 pt-6">
                <div className="flex items-baseline">
                  <span className="font-mono text-5xl font-black text-white tracking-tight">
                    ${(currentPrice / 100).toFixed(0)}
                  </span>
                  <span className="ml-2 text-sm text-zinc-400 font-bold">
                    / {getIntervalLabel()}
                  </span>
                </div>
                {p.discount_percent > 0 && (
                  <p className="mt-2 text-xs font-black uppercase tracking-wide text-emerald-400 flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5 fill-emerald-400/20 text-emerald-400" />
                    {p.discount_percent}% Member Discount Included
                  </p>
                )}
              </div>

              <div className="flex-1 space-y-4 mb-8">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">What's Included</p>
                <ul className="space-y-3 text-xs leading-relaxed text-zinc-300">
                  {benefits.map((b) => (
                    <li key={b} className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 shrink-0 text-gold-soft mt-0.5" />
                      <span>{b}</span>
                    </li>
                  ))}
                  {included.map((inc) => (
                    <li key={inc} className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 shrink-0 text-gold-soft mt-0.5" />
                      <span className="font-semibold text-white">{inc}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-auto pt-6 border-t border-white/5 space-y-3">
                <MembershipJoinButton planId={p.id} interval={interval} />
                <Link
                  href="/book"
                  className="block w-full rounded-xl border border-white/10 px-5 py-3 text-center text-xs font-black uppercase tracking-wider text-white bg-white/5 transition hover:bg-white/10 hover:border-white/20"
                >
                  Book One-Time Detail
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {/* Comparison Table Section */}
      <section className="max-w-5xl mx-auto mb-24">
        <div className="text-center mb-12">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-gold-soft">Side-by-Side Comparison</p>
          <h3 className="mt-2 text-3xl font-black uppercase text-white tracking-tight">Compare Membership Inclusions</h3>
          <p className="mt-2 text-sm text-zinc-400">Every value below comes from the active admin membership plans.</p>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-white/10 bg-black/40 backdrop-blur-sm shadow-[0_0_40px_rgba(0,0,0,0.6)]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-zinc-950/60">
                <th className="p-5 text-[10px] font-black uppercase tracking-wider text-zinc-400">Membership Features</th>
                {plans.map((plan) => (
                  <th key={plan.id} className="p-5 text-center text-[10px] font-black uppercase tracking-wider text-gold-soft">
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs text-zinc-300">
              <tr>
                <td className="p-5 font-bold text-white">Available Billing</td>
                {plans.map((plan) => {
                  const intervals = [
                    plan.price_biweekly_cents > 0 ? 'Bi-weekly' : '',
                    (plan.price_monthly_cents || plan.price_cents) > 0 ? 'Monthly' : '',
                    plan.price_yearly_cents > 0 ? 'Yearly' : '',
                  ].filter(Boolean);
                  return <td key={plan.id} className="p-5 text-center">{intervals.join(' / ') || 'Contact us'}</td>;
                })}
              </tr>
              <tr>
                <td className="p-5 font-bold text-white">Member Discount on Packages</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="p-5 text-center font-mono">
                    {plan.discount_percent > 0 ? String(plan.discount_percent) + '%' : 'Configured in admin'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-5 font-bold text-white">Included Services</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="p-5 text-center">
                    {plan.included_services?.slice(0, 3).join(', ') || 'Configured in admin'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-5 font-bold text-white">Priority Scheduling</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="p-5 text-center">
                    {(plan.benefits ?? []).some((benefit) => benefit.toLowerCase().includes('priority'))
                      ? <Check className="h-4 w-4 mx-auto text-gold-soft" />
                      : 'Configured in admin'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-5 font-bold text-white">Loyalty Rewards</td>
                {plans.map((plan) => (
                  <td key={plan.id} className="p-5 text-center">
                    {(plan.benefits ?? []).find((benefit) => /loyalty|stamp|punch/i.test(benefit)) ?? 'Digital punch card eligible'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-gold-soft">Got Questions?</p>
          <h3 className="mt-2 text-3xl font-black uppercase text-white tracking-tight">Detailing Memberships FAQ</h3>
          <p className="mt-2 text-sm text-zinc-400">Everything you need to know about Gloss Boss maintenance subscriptions.</p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = activeFaq === index;
            return (
              <div
                key={index}
                className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm overflow-hidden transition-all duration-300"
              >
                <button
                  type="button"
                  onClick={() => setActiveFaq(isOpen ? null : index)}
                  className="w-full flex items-center justify-between p-5 text-left transition hover:bg-white/5"
                >
                  <span className="text-sm font-bold text-white flex items-center gap-3">
                    <HelpCircle className="h-4.5 w-4.5 text-gold-soft shrink-0" />
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-zinc-400 transition-transform duration-300 shrink-0 ${
                      isOpen ? 'rotate-180 text-gold-soft' : ''
                    }`}
                  />
                </button>
                <div
                  className={`transition-all duration-300 ease-in-out ${
                    isOpen ? 'max-h-40 border-t border-white/5' : 'max-h-0'
                  } overflow-hidden`}
                >
                  <p className="p-5 text-xs leading-relaxed text-zinc-400 bg-zinc-950/25">
                    {faq.a}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
