'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Gauge, ShieldCheck, Sparkles, Truck, X, Zap } from 'lucide-react';
import { BeforeAfterRotator } from '@/components/marketing/before-after-rotator';
import { ContactForm } from '@/components/marketing/contact-form';
import { HomeGalleryStrip } from '@/components/marketing/home-gallery-strip';
import { MotionFade } from '@/components/marketing/motion-fade';
import { OffersMarketingBand } from '@/components/marketing/offers-marketing-band';
import { SectionErrorBoundary } from '@/components/site/section-error-boundary';
import {
  defaultDealConfig,
  defaultServicePackages,
  formatStartingPrice,
  PRICING_DISCLAIMER,
  PRICING_DISCOUNT_RULES,
  type DealConfig,
  type ServicePackage,
} from '@/lib/site-config';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import {
  isOfferEligiblePublicSiteData,
  type PublicSiteDataPayload,
  type SiteDataOfferCard,
  type SiteDataMultiCar,
} from '@/lib/public-site-data';

const emptyDeals: DealConfig = {
  websitePromoPercent: 0,
  websitePromoLabel: '',
  websitePromoActive: false,
  multiCarSecondVehicleDiscountPercent: 0,
  promoStacksWithMultiCar: true,
};

const faqs = [
  {
    q: 'Do I need inspection photos before booking?',
    a: 'No. You book, pay your deposit, and sign the liability acknowledgment on-site. Our technicians capture inspection and completion photos during the job.',
  },
  {
    q: 'How does the 30% deposit work?',
    a: 'You pay a secure Stripe deposit during checkout, and the remainder is due upon service completion.',
  },
  {
    q: 'Can I rebook quickly?',
    a: 'Yes. Customer accounts can save vehicle details and booking preferences for fast rebooking.',
  },
];

export default function HomePage() {
  const [showPromoPopup, setShowPromoPopup] = useState(true);
  const [services, setServices] = useState<ServicePackage[]>([]);
  const [deals, setDeals] = useState<DealConfig>(emptyDeals);
  const [offers, setOffers] = useState<SiteDataOfferCard[]>([]);
  const [multiCar, setMultiCar] = useState<SiteDataMultiCar | null>(null);
  const [siteLoaded, setSiteLoaded] = useState(false);
  const [googleReviewUrl, setGoogleReviewUrl] = useState('');

  /** Stable layout while catalog loads; swap to live rows once `siteLoaded`. */
  const packagesForGrid = siteLoaded && services.length > 0 ? services : defaultServicePackages;
  const displayDeals = siteLoaded ? deals : defaultDealConfig;

  useEffect(() => {
    let cancelled = false;
    const tid = window.setTimeout(() => {
      if (!cancelled) {
        setSiteLoaded(true);
      }
    }, 10000);
    fetchWithTimeout('/api/public/site-data', { cache: 'no-store', timeoutMs: 8000 })
      .then(async (r) => {
        try {
          return (await r.json()) as PublicSiteDataPayload;
        } catch {
          return null;
        }
      })
      .then((data) => {
        if (!data || cancelled) return;
        setServices(data.services ?? []);
        setDeals(data.deals ?? emptyDeals);
        setOffers(data.offers ?? []);
        setMultiCar(data.multiCar ?? null);
        setGoogleReviewUrl(data.googleReviewUrl ?? '');
        if (process.env.NODE_ENV === 'development' && (data.schemaWarnings?.length ?? 0) > 0) {
          console.warn('[homepage] site-data schema warnings (not shown to visitors):', data.schemaWarnings);
        }
        setSiteLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setSiteLoaded(true);
        }
      })
      .finally(() => clearTimeout(tid));
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, []);

  const fmtMoney = (cents: number) => `$${(cents / 100).toFixed(0)}`;

  const hasHomeOffers = useMemo(() => {
    const now = new Date();
    return offers.some((o) => o.showOnHomepage && isOfferEligiblePublicSiteData(o, now));
  }, [offers]);

  return (
    <main className='gb-page relative min-h-screen text-foreground'>
      {showPromoPopup && displayDeals.websitePromoActive && displayDeals.websitePromoPercent > 0 ? (
        <div
          role='dialog'
          aria-modal='true'
          aria-labelledby='promo-dialog-title'
          className='fixed inset-x-4 top-24 z-[60] mx-auto max-w-md rounded-2xl border border-gold/40 bg-black/95 p-4 shadow-[0_0_35px_rgba(212,166,77,0.3)]'
        >
          <button
            type='button'
            onClick={() => setShowPromoPopup(false)}
            className='absolute right-2 top-2 rounded-md border border-white/20 p-1 text-zinc-300 hover:bg-white/10'
            aria-label='Close offer popup'
          >
            <X size={14} />
          </button>
          <p id='promo-dialog-title' className='pr-8 text-xs uppercase tracking-[0.2em] text-gold-soft'>
            {displayDeals.websitePromoLabel || 'Website booking offer'}
          </p>
          <p className='mt-2 text-2xl font-black text-white'>{displayDeals.websitePromoPercent}% OFF Website Bookings</p>
          <p className='mt-1 text-sm text-zinc-300'>
            Limited slots. Promo applies to eligible booking subtotals as shown at checkout. Combine with CMS offer links only when stacking is enabled for that offer.
          </p>
          <div className='mt-3 flex flex-wrap gap-2'>
            <Link href='/book' className='rounded-lg bg-gold px-4 py-2 text-xs font-bold uppercase tracking-widest text-black'>
              Claim Offer
            </Link>
            <button
              type='button'
              onClick={() => setShowPromoPopup(false)}
              className='rounded-lg border border-white/20 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-white/10'
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <section className='relative flex min-h-[min(100vh,920px)] items-center px-4 pb-20 pt-24 sm:px-6 lg:px-8'>
        <div className='gb-hero absolute inset-4 overflow-hidden rounded-3xl sm:inset-6 lg:inset-8'>
          <div
            className='gb-hero-media'
            style={{ backgroundImage: `url("https://images.unsplash.com/photo-1617531653520-4893f7bbf978?auto=format&fit=crop&w=2000&q=80")` }}
          />
          <div className='gb-hero-scrim' />
        </div>

        <div className='relative z-10 mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[1.05fr_0.95fr]'>
          <MotionFade>
            <div className='gb-hero-content gb-hero rounded-3xl border border-gold/25 p-6 sm:p-10'>
              <p className='gb-eyebrow'>Austin, Texas</p>
              <h1 className='gb-display-serif mt-4 text-4xl font-black uppercase leading-[1.02] tracking-tight text-white sm:text-5xl lg:text-6xl'>
                Luxury Mobile Detailing in Austin, Texas
              </h1>
              <p className='mt-6 max-w-xl text-sm leading-relaxed text-zinc-300 sm:text-base'>
                Premium mobile detailing with inspection photos, secure deposits, and concierge communication — built like a modern automotive platform.
              </p>
              <div className='mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap'>
                <Link href='/book' className='gb-button-primary inline-flex text-center'>
                  Book Now <ArrowRight size={16} />
                </Link>
                <Link href='/services' className='gb-button-secondary text-center'>
                  View Services
                </Link>
                <Link href='/gift-cards' className='rounded-xl border border-white/25 bg-black/50 px-6 py-4 text-center text-xs font-black uppercase tracking-wider text-white transition hover:border-gold/50'>
                  Gift Cards
                </Link>
              </div>
              <div className='gb-trust-strip mt-10 gap-3'>
                {[
                  { icon: Truck, t: 'Mobile service', d: 'We come to you' },
                  { icon: ShieldCheck, t: 'Licensed & insured', d: 'Fully covered ops' },
                  { icon: Sparkles, t: 'Premium products', d: 'Pro-grade chemistry' },
                  { icon: Gauge, t: 'Satisfaction first', d: 'Documented results' },
                ].map((x) => (
                  <div key={x.t} className='gb-glass-card gb-glow-hover rounded-2xl p-4 text-left'>
                    <x.icon className='h-5 w-5 text-gold-soft' aria-hidden />
                    <p className='mt-2 text-[11px] font-black uppercase tracking-wider text-white'>{x.t}</p>
                    <p className='mt-1 text-xs text-zinc-500'>{x.d}</p>
                  </div>
                ))}
              </div>
            </div>
          </MotionFade>

          <MotionFade delay={0.1}>
            <div className='grid gap-4 sm:grid-cols-1'>
              <SectionErrorBoundary label='Before / after'>
                <BeforeAfterRotator />
              </SectionErrorBoundary>
              <article className='gb-glass-card gb-glow-hover rounded-2xl p-5'>
                <p className='gb-eyebrow'>Current offers</p>
                <p className='mt-3 text-lg font-bold text-white'>Multi-car & online promos</p>
                {displayDeals.multiCarSecondVehicleDiscountPercent > 0 ? (
                  <p className='mt-1 text-sm text-zinc-300'>
                    {displayDeals.multiCarSecondVehicleDiscountPercent}% off the second vehicle when both are booked in one appointment window.
                  </p>
                ) : siteLoaded ? (
                  <p className='mt-1 text-sm text-zinc-400'>Multi-car discount appears here once deal settings are saved in Admin.</p>
                ) : (
                  <p className='mt-1 text-sm text-zinc-300'>When you book two vehicles in the same appointment window.</p>
                )}
                {displayDeals.websitePromoActive && displayDeals.websitePromoPercent > 0 ? (
                  <div className='mt-3 space-y-1 text-sm text-gold-soft'>
                    <p>
                      Online booking: <span className='font-semibold text-white'>{displayDeals.websitePromoPercent}% off</span> eligible
                      services when you book through this site.
                    </p>
                    {displayDeals.multiCarSecondVehicleDiscountPercent > 0 ? (
                      <p className='text-xs leading-relaxed text-zinc-300'>
                        Multi-car: an <span className='font-semibold text-white'>additional {displayDeals.multiCarSecondVehicleDiscountPercent}%</span>{' '}
                        applies to the <span className='font-semibold text-white'>second vehicle only</span> when two vehicles are booked in the
                        same appointment — not a flat {displayDeals.websitePromoPercent + displayDeals.multiCarSecondVehicleDiscountPercent}% off the
                        entire order.
                        {displayDeals.promoStacksWithMultiCar === false ? ' These offers do not stack; checkout uses the better eligible discount.' : ''}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {multiCar ? (
                  <p className='mt-3 text-xs leading-relaxed text-zinc-400'>
                    Example: {multiCar.serviceSlug.replace(/-/g, ' ')} ({multiCar.vehicleClass.replace('_', ' ')}) — {fmtMoney(multiCar.firstCents)} +{' '}
                    {fmtMoney(multiCar.secondCents)} = {fmtMoney(multiCar.totalCents)} total
                    {multiCar.discountPercent > 0 ? ` (${multiCar.discountPercent}% off 2nd vehicle).` : '.'}
                  </p>
                ) : siteLoaded && services.length > 0 ? (
                  <p className='mt-3 text-xs text-zinc-400'>Publish services and prices to show a live multi-car example.</p>
                ) : null}
                {hasHomeOffers ? <OffersMarketingBand offers={offers} placement='homepage' heading='' className='mt-4' /> : null}
              </article>
            </div>
          </MotionFade>
        </div>
      </section>

      <section id='services' className='mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8' aria-busy={!siteLoaded}>
        <MotionFade>
          <p className='gb-eyebrow'>Detailing packages</p>
          <h2 className='gb-section-title mt-2'>Built for excellence</h2>
          {!siteLoaded ? <p className='mt-2 text-xs text-zinc-500'>Loading latest packages…</p> : null}
        </MotionFade>
        <div className='mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
          {packagesForGrid.map((service, index) => (
              <MotionFade key={`${siteLoaded ? 'live' : 'seed'}-${service.id}`} delay={index * 0.06}>
                <article className='gb-card gb-glow-hover rounded-2xl p-5'>
                  <h3 className='text-lg font-bold text-gold-soft'>{service.title}</h3>
                  <p className='mt-2 text-sm text-zinc-300'>{service.subtitle}</p>
                  <p className='mt-4 text-3xl font-black'>
                    {formatStartingPrice(service.sedanPrice)}
                  </p>
                </article>
              </MotionFade>
          ))}
        </div>
        <p className='mt-6 max-w-3xl text-xs leading-relaxed text-zinc-500'>{PRICING_DISCLAIMER}</p>
        <p className='mt-2 max-w-3xl text-xs leading-relaxed text-zinc-500'>{PRICING_DISCOUNT_RULES}</p>
        <div className='mt-6 flex flex-wrap gap-3'>
          <Link href='/services' className='rounded-lg border border-gold/30 px-5 py-3 text-sm font-bold uppercase tracking-wider text-gold-soft'>
            Full service details
          </Link>
          <Link href='/book' className='rounded-lg bg-gold px-5 py-3 text-sm font-bold uppercase tracking-wider text-black'>
            Start booking
          </Link>
        </div>
      </section>

      <section className='mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8'>
        <MotionFade>
          <p className='gb-eyebrow'>How it works</p>
          <h2 className='gb-section-title mt-2'>From booking to showroom finish</h2>
        </MotionFade>
        <div className='relative mt-10 grid gap-6 md:grid-cols-4'>
          <div className='gb-how-rail' aria-hidden />
          {['Book online', 'We arrive prepared', 'Detail & document', 'You drive a boss car'].map((t, i) => (
            <MotionFade key={t} delay={i * 0.06}>
              <div className='gb-how-step gb-card gb-glow-hover rounded-2xl p-5 text-center'>
                <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-gold/50 bg-gold/15 text-sm font-black text-gold-soft'>
                  {i + 1}
                </div>
                <p className='mt-4 text-sm font-bold text-white'>{t}</p>
              </div>
            </MotionFade>
          ))}
        </div>
      </section>

      <section className='border-y border-gold/10 bg-black/40 px-4 py-16 sm:px-6 lg:px-8'>
        <div className='mx-auto max-w-7xl'>
          <MotionFade>
            <p className='gb-eyebrow'>Memberships</p>
            <h2 className='gb-section-title mt-2'>Recurring care for fleets & enthusiasts</h2>
            <p className='mt-3 max-w-2xl text-sm text-zinc-400'>
              Bi-weekly and monthly maintenance plans — custom pricing for volume, fleets, and loyalty.
            </p>
          </MotionFade>
          <div className='mt-10 grid gap-4 md:grid-cols-3'>
            {['Basic maintenance', 'Plus protection', 'Elite concierge'].map((title, i) => (
              <MotionFade key={title} delay={i * 0.06}>
                <article className='gb-gold-card gb-glow-hover rounded-2xl p-6'>
                  <p className='text-xs font-black uppercase tracking-widest text-gold-soft'>{title}</p>
                  <ul className='mt-4 space-y-2 text-sm text-zinc-300'>
                    <li>· Scheduled visits</li>
                    <li>· Priority routing</li>
                    <li>· Documented results</li>
                  </ul>
                  <Link href='/book' className='mt-6 inline-block text-xs font-black uppercase text-gold-soft underline'>
                    Discuss at booking →
                  </Link>
                </article>
              </MotionFade>
            ))}
          </div>
        </div>
      </section>

      <section id='gallery' className='border-y border-white/10 bg-black/60 px-4 py-16 sm:px-6 lg:px-8'>
        <div className='mx-auto w-full max-w-7xl'>
          <MotionFade>
            <h2 className='gb-section-title'>Featured transformations</h2>
            <p className='mt-2 max-w-2xl text-sm text-zinc-400'>Live gallery from your CMS — add photos in Admin → Website CMS.</p>
            <Link href='/gallery' className='mt-3 inline-block text-xs font-black uppercase tracking-wider text-gold-soft underline'>
              View full transformation portfolio →
            </Link>
          </MotionFade>
          <SectionErrorBoundary label='Gallery'>
            <HomeGalleryStrip />
          </SectionErrorBoundary>
        </div>
      </section>

      <section id='about' className='mx-auto grid w-full max-w-7xl gap-6 px-4 py-16 sm:px-6 lg:grid-cols-3 lg:px-8'>
        {[
          { icon: ShieldCheck, title: 'Workflow Protection', desc: 'Deposit, signed agreements, and timestamped inspection history handled in-platform.' },
          { icon: Gauge, title: 'Performance Booking', desc: 'Modern flow with deposits, service options, and account tracking.' },
          { icon: Zap, title: 'Premium Experience', desc: 'Luxury visual language with high-end customer communication.' },
        ].map((item, index) => (
          <MotionFade key={item.title} delay={index * 0.06}>
            <article className='rounded-2xl border border-gold/20 bg-zinc-950 p-6'>
              <item.icon className='text-gold' />
              <h3 className='mt-4 text-lg font-bold'>{item.title}</h3>
              <p className='mt-2 text-sm text-zinc-300'>{item.desc}</p>
            </article>
          </MotionFade>
        ))}
      </section>

      <section className='mx-auto w-full max-w-5xl px-4 py-12 sm:px-6'>
        <MotionFade>
          <h2 className='text-2xl font-black uppercase tracking-[0.12em] sm:text-3xl'>Hours & service area</h2>
          <div className='mt-6 grid gap-4 sm:grid-cols-2'>
            <article className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
              <p className='text-xs uppercase tracking-wider text-gold-soft'>Operating hours</p>
              <ul className='mt-3 space-y-2 text-sm text-zinc-300'>
                <li><span className='font-semibold text-white'>Friday</span> — 5:00 PM to 9:00 PM</li>
                <li><span className='font-semibold text-white'>Saturday</span> — 7:30 AM to 7:00 PM</li>
                <li><span className='font-semibold text-white'>Sunday</span> — 7:30 AM to 7:00 PM</li>
              </ul>
            </article>
            <article className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
              <p className='text-xs uppercase tracking-wider text-gold-soft'>Contact</p>
              <p className='mt-3 text-sm text-zinc-300'>
                <a href='tel:+15124812319' className='font-bold text-gold-soft hover:text-white'>(512) 481-2319</a>
              </p>
              <p className='mt-2 text-sm text-zinc-300'>
                <a href='mailto:glossbossatx1@gmail.com' className='text-gold-soft hover:text-white'>glossbossatx1@gmail.com</a>
              </p>
              <p className='mt-2 text-sm text-zinc-400'>Austin, Texas & surrounding areas</p>
            </article>
          </div>
        </MotionFade>
      </section>

      <section id='faq' className='mx-auto w-full max-w-5xl px-4 py-16 sm:px-6'>
        <MotionFade>
          <h2 className='text-2xl font-black uppercase tracking-[0.12em] sm:text-4xl'>FAQ</h2>
        </MotionFade>
        <div className='mt-8 space-y-4'>
          {faqs.map((faq, index) => (
            <MotionFade key={faq.q} delay={index * 0.05}>
              <article className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
                <h3 className='font-semibold text-gold-soft'>{faq.q}</h3>
                <p className='mt-2 text-sm text-zinc-300'>{faq.a}</p>
              </article>
            </MotionFade>
          ))}
        </div>
      </section>

      <footer id='contact' className='border-t border-white/10 bg-black/80 px-4 py-12 sm:px-6'>
        <div className='mx-auto flex w-full max-w-7xl flex-col gap-10 lg:flex-row lg:items-start lg:justify-between'>
          <div className='flex-1'>
            <p className='text-sm uppercase tracking-[0.2em] text-gold-soft'>Gloss Boss ATX</p>
            <p className='mt-2 text-zinc-200'>
              <a href='tel:+15124812319' className='text-gold-soft underline decoration-gold/40 underline-offset-2 hover:text-white'>
                (512) 481-2319
              </a>
              <span className='text-zinc-500'> · </span>
              <a href='mailto:glossbossatx1@gmail.com' className='hover:text-gold-soft'>
                glossbossatx1@gmail.com
              </a>
            </p>
            <p className='text-zinc-400'>Austin, Texas & surrounding areas</p>
            <div className='mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap'>
              <a href='https://instagram.com/glossbossatx' className='rounded-lg border border-gold/40 px-5 py-3 text-center text-xs font-bold uppercase tracking-widest text-gold-soft'>
                Instagram
              </a>
              <Link href='/book' className='rounded-lg bg-gold px-5 py-3 text-center text-xs font-bold uppercase tracking-widest text-black'>
                Reserve Appointment
              </Link>
              <Link href='/gift-cards' className='rounded-lg border border-white/20 px-5 py-3 text-center text-xs font-bold uppercase tracking-widest text-white'>
                Gift Cards
              </Link>
              {googleReviewUrl ? (
                <a
                  href={googleReviewUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='rounded-lg border border-gold/50 bg-black/60 px-5 py-3 text-center text-xs font-bold uppercase tracking-widest text-gold-soft transition hover:border-gold'
                >
                  Leave us a Google Review
                </a>
              ) : null}
            </div>
            {!googleReviewUrl ? (
              <p className='mt-3 text-xs text-zinc-500'>Add your Google review URL in Admin → Website CMS to show the review button in the footer.</p>
            ) : null}
            <nav className='mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-xs font-bold uppercase tracking-wider' aria-label='Legal'>
              <Link href='/privacy' className='text-zinc-400 transition hover:text-gold-soft'>
                Privacy Policy
              </Link>
              <Link href='/terms' className='text-zinc-400 transition hover:text-gold-soft'>
                Terms &amp; Conditions
              </Link>
            </nav>
          </div>
          <SectionErrorBoundary label='Contact form'>
            <ContactForm />
          </SectionErrorBoundary>
        </div>
      </footer>
    </main>
  );
}
