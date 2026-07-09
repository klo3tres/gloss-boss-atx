'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ShieldCheck, Zap } from 'lucide-react';
import { FleetInquiryForm } from '@/components/public/fleet-inquiry-form';
import { OffersMarketingBand } from '@/components/marketing/offers-marketing-band';
import { ServicePackageShowcase } from '@/components/marketing/service-package-showcase';
import { PremiumButton } from '@/components/premium/premium-button';
import { PremiumEyebrow } from '@/components/premium/premium-eyebrow';
import { StickyBookCta } from '@/components/premium/sticky-book-cta';
import { usePublicSiteData } from '@/hooks/use-public-site-data';
import { serviceCategoryFilter } from '@/lib/marketing/service-presentation';
import { isOfferEligiblePublicSiteData } from '@/lib/public-site-data';
import { PRICING_DISCLAIMER, PRICING_DISCOUNT_RULES } from '@/lib/site-config';
import { HeroReviewTrust } from '@/components/marketing/hero-review-trust';
import { MotionFade } from '@/components/marketing/motion-fade';

type ServiceTab = 'all' | 'exterior' | 'interior' | 'full' | 'ceramic';

const TABS: { id: ServiceTab; label: string }[] = [
  { id: 'all', label: 'All services' },
  { id: 'exterior', label: 'Exterior' },
  { id: 'interior', label: 'Interior' },
  { id: 'full', label: 'Full detail' },
  { id: 'ceramic', label: 'Ceramic' },
];

export function ServicesPageView() {
  const state = usePublicSiteData();
  const { packages, offers, loaded, schemaWarnings, mediaRegistry, fleetEnabled, fleetBlurb, reviews, googleReviewUrl } = state;

  const [activeTab, setActiveTab] = useState<ServiceTab>('all');
  const filtered = packages.filter((s) => serviceCategoryFilter(s, activeTab));
  const hasOffers = offers.some((o) => o.showOnServices && isOfferEligiblePublicSiteData(o, new Date()));

  return (
    <main className="gb-marketing-page gb-page gb-page-pad min-h-screen bg-background text-foreground">
      <StickyBookCta />

      <section className="relative overflow-hidden border-b border-border px-4 pb-14 pt-24 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(212,175,55,0.14),transparent_55%)]" />
        <div className="relative mx-auto max-w-5xl">
          <MotionFade>
            <PremiumEyebrow>Service menu</PremiumEyebrow>
            <h1 className="mt-4 text-4xl font-black uppercase tracking-tight text-foreground sm:text-5xl">
              Premium mobile detailing
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Clear packages, honest pricing, and showroom results — booked online with a secure deposit.
            </p>
            {loaded && reviews.length > 0 ? (
              <div className="mt-6">
                <HeroReviewTrust reviews={reviews} googleReviewUrl={googleReviewUrl} bookingHref="/book" compact />
              </div>
            ) : null}
            <div className="mt-8 flex flex-wrap gap-3">
              <PremiumButton href="/book">Book now</PremiumButton>
              <PremiumButton href="/memberships" variant="secondary">
                Membership savings
              </PremiumButton>
            </div>
          </MotionFade>

          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {[
              { icon: ShieldCheck, label: 'Licensed & insured' },
              { icon: Zap, label: 'Online booking + Stripe deposit' },
            ].map((item) => (
              <div key={item.label} className="gb-premium-card flex items-center gap-3 rounded-2xl border border-border p-4">
                <item.icon className="h-5 w-5 shrink-0 text-gold-soft" />
                <p className="text-xs font-bold uppercase tracking-wide text-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {schemaWarnings.length > 0 ? (
        <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:px-8">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-900 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{schemaWarnings[0]}</p>
          </div>
        </div>
      ) : null}

      {hasOffers ? <OffersMarketingBand offers={offers} placement="services" /> : null}

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-wider transition ${
                activeTab === tab.id
                  ? 'border-gold/40 bg-gold/15 text-gold-soft'
                  : 'border-border text-muted-foreground hover:border-gold/25 hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-10" aria-busy={!loaded}>
          {filtered.map((service, index) => (
            <ServicePackageShowcase
              key={service.id}
              service={service}
              mediaRegistry={mediaRegistry}
              index={index}
              reverse={index % 2 === 1}
            />
          ))}
        </div>

        {loaded && filtered.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No services in this category yet.{' '}
            <button type="button" onClick={() => setActiveTab('all')} className="text-gold-soft underline">
              View all
            </button>
          </p>
        ) : null}
      </section>

      <section className="border-t border-border bg-muted/30 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <PremiumEyebrow>Pricing notes</PremiumEyebrow>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">{PRICING_DISCLAIMER}</p>
          <p className="mt-3 max-w-3xl text-xs text-muted-foreground/80">{PRICING_DISCOUNT_RULES}</p>
        </div>
      </section>

      {fleetEnabled ? (
        <section className="border-t border-border px-4 py-14 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2">
            <div>
              <PremiumEyebrow>Fleet & commercial</PremiumEyebrow>
              <h2 className="mt-3 text-2xl font-black uppercase text-foreground">Volume pricing</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {fleetBlurb || 'Recurring fleet detailing for Austin businesses.'}
              </p>
              <Link href="/fleet" className="mt-5 inline-flex text-[10px] font-black uppercase text-gold-soft hover:underline">
                Full fleet page →
              </Link>
            </div>
            <FleetInquiryForm />
          </div>
        </section>
      ) : null}

      <section className="border-t border-border py-16 text-center">
        <div className="mx-auto max-w-xl px-4">
          <h2 className="text-2xl font-black uppercase text-foreground">Ready to book?</h2>
          <p className="mt-3 text-sm text-muted-foreground">Reserve your slot with a secure deposit.</p>
          <div className="mt-6">
            <PremiumButton href="/book">Start booking</PremiumButton>
          </div>
        </div>
      </section>
    </main>
  );
}
