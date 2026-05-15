'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Gauge, ShieldCheck, Sparkles, X, Zap } from 'lucide-react';
import { BeforeAfterRotator } from '@/components/marketing/before-after-rotator';
import { ContactForm } from '@/components/marketing/contact-form';
import { MotionFade } from '@/components/marketing/motion-fade';
import { HomeGalleryStrip } from '@/components/marketing/home-gallery-strip';
import { SectionErrorBoundary } from '@/components/site/section-error-boundary';
import {
  defaultDealConfig,
  defaultServicePackages,
  formatStartingPrice,
  type DealConfig,
  type ServicePackage,
} from '@/lib/site-config';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import type { PublicSiteDataPayload, SiteDataOfferCard, SiteDataMultiCar } from '@/lib/public-site-data';

const emptyDeals: DealConfig = {
  websitePromoPercent: 0,
  websitePromoLabel: '',
  websitePromoActive: false,
  multiCarSecondVehicleDiscountPercent: 0,
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
  const [dismissSchemaNotice, setDismissSchemaNotice] = useState(false);
  const [services, setServices] = useState<ServicePackage[]>([]);
  const [deals, setDeals] = useState<DealConfig>(emptyDeals);
  const [offers, setOffers] = useState<SiteDataOfferCard[]>([]);
  const [multiCar, setMultiCar] = useState<SiteDataMultiCar | null>(null);
  const [schemaWarnings, setSchemaWarnings] = useState<string[]>([]);
  const [siteLoaded, setSiteLoaded] = useState(false);

  /** Stable layout while catalog loads; swap to live rows once `siteLoaded`. */
  const packagesForGrid = siteLoaded && services.length > 0 ? services : defaultServicePackages;
  const displayDeals = siteLoaded ? deals : defaultDealConfig;

  useEffect(() => {
    let cancelled = false;
    const tid = window.setTimeout(() => {
      if (!cancelled) {
        setSchemaWarnings((w) => (w.length ? w : ['Public site data request timed out — showing defaults.']));
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
        setSchemaWarnings(data.schemaWarnings ?? []);
        setSiteLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setSchemaWarnings(['Could not load public site data.']);
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
  const activeOffers = [...offers].filter((o) => o.active).sort((a, b) => a.sortOrder - b.sortOrder);

  const showSchemaNotice = schemaWarnings.length > 0 && !dismissSchemaNotice;

  return (
    <main className='relative min-h-screen overflow-x-hidden bg-background text-foreground'>
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
          <p className='mt-1 text-sm text-zinc-300'>Limited slots. Promo is applied at confirmation and cannot be combined with other offers.</p>
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

      <section className='relative flex min-h-screen items-center border-b border-white/10 px-4 pb-16 pt-28 sm:px-6 lg:px-8'>
        <div className='absolute inset-0'>
          <div className='absolute inset-0 bg-[url("https://images.unsplash.com/photo-1617531653520-4893f7bbf978?auto=format&fit=crop&w=1900&q=80")] bg-cover bg-center opacity-25' />
          <div className='absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(212,166,77,0.28),transparent_38%),radial-gradient(circle_at_80%_60%,rgba(212,166,77,0.14),transparent_40%),linear-gradient(to_bottom,rgba(0,0,0,0.55),rgba(0,0,0,0.95))]' />
        </div>

        <div className='relative mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[1.1fr_0.9fr]'>
          <MotionFade>
            <div>
              <p className='inline-flex items-center gap-2 rounded-full border border-gold/40 bg-black/50 px-4 py-2 text-xs uppercase tracking-[0.22em] text-gold-soft'>
                <Sparkles size={14} /> Ride Clean. Ride Like A Boss.
              </p>
              <div className='mt-5'>
                <Image
                  src='/brand/glossboss-clean-logo.png'
                  alt='Gloss Boss ATX official logo'
                  width={560}
                  height={280}
                  className='h-auto w-full max-w-2xl'
                  priority
                />
              </div>
              <h1 className='mt-5 text-4xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-6xl lg:text-7xl'>
                Luxury
                <br />
                Automotive
                <br />
                Detailing
              </h1>
              <p className='mt-6 max-w-xl text-sm leading-relaxed text-zinc-300 sm:text-base'>
                Mobile detailing in Austin, Texas with premium process standards, visual inspection records, and modern booking.
              </p>
              <div className='mt-8 flex flex-col gap-3 sm:flex-row'>
                <Link href='/book' className='inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-6 py-4 text-sm font-bold uppercase tracking-[0.15em] text-black shadow-[0_0_30px_rgba(212,166,77,0.4)] transition hover:brightness-110'>
                  Book Now <ArrowRight size={16} />
                </Link>
                <Link href='/services' className='rounded-xl border border-gold/40 bg-black/40 px-6 py-4 text-center text-sm font-bold uppercase tracking-[0.15em] text-gold-soft transition hover:border-gold'>
                  View Services
                </Link>
                <Link href='/gift-cards' className='rounded-xl border border-white/30 bg-black/50 px-6 py-4 text-center text-sm font-bold uppercase tracking-[0.15em] text-white transition hover:border-gold/60'>
                  Buy Gift Card
                </Link>
              </div>
              <div className='mt-6 rounded-xl border border-gold/20 bg-black/40 p-4 text-sm text-zinc-300'>
                <p className='font-semibold text-gold-soft'>Quick Contact</p>
                <p className='mt-1'>(512) 481-2319 · glossbossatx1@gmail.com</p>
                <p className='text-zinc-400'>Austin, Texas & surrounding areas</p>
              </div>
            </div>
          </MotionFade>

          <MotionFade delay={0.1}>
            <div className='grid gap-4 sm:grid-cols-1'>
              <SectionErrorBoundary label='Before / after'>
                <BeforeAfterRotator />
              </SectionErrorBoundary>
              <article className='rounded-2xl border border-gold/20 bg-black/60 p-5 backdrop-blur'>
                {showSchemaNotice ? (
                  <div
                    role='alert'
                    className='mb-4 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-left text-sm text-amber-100'
                  >
                    <div className='flex items-start justify-between gap-2'>
                      <div className='min-w-0 flex-1'>
                        <p className='font-semibold'>Missing database configuration: run migrations</p>
                        <ul className='mt-2 list-disc space-y-1 pl-4 text-xs break-words text-amber-100/95'>
                          {schemaWarnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </div>
                      <button
                        type='button'
                        onClick={() => setDismissSchemaNotice(true)}
                        className='shrink-0 rounded border border-amber-400/50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-50 hover:bg-amber-500/20'
                        aria-label='Dismiss configuration notice'
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ) : null}
                <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Current Offers</p>
                <p className='mt-3 text-lg font-bold text-white'>Multi-Car Deal</p>
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
                  <p className='mt-3 text-sm text-gold-soft'>
                    Limited time: {displayDeals.websitePromoPercent}% off web bookings (non-stackable with multi-car discount).
                  </p>
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
                {activeOffers.length > 0 ? (
                  <ul className='mt-4 max-h-40 space-y-2 overflow-y-auto pr-1 text-left' aria-label='Active promotional offers'>
                    {activeOffers.map((o) => (
                      <li key={o.id} className='rounded-lg border border-gold/15 bg-black/50 px-3 py-2 text-sm text-zinc-200'>
                        <span className='font-semibold text-gold-soft'>{o.title}</span>
                        {o.discountPercent > 0 ? <span className='text-zinc-400'> — {o.discountPercent}%</span> : null}
                        {o.description ? <p className='mt-1 text-xs text-zinc-500'>{o.description}</p> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            </div>
          </MotionFade>
        </div>
      </section>

      <section id='services' className='mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8' aria-busy={!siteLoaded}>
        <MotionFade>
          <h2 className='text-2xl font-black uppercase tracking-[0.12em] sm:text-4xl'>Premium Service Packages</h2>
          {!siteLoaded ? <p className='mt-2 text-xs text-zinc-500'>Loading latest packages…</p> : null}
        </MotionFade>
        <div className='mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
          {packagesForGrid.map((service, index) => (
              <MotionFade key={`${siteLoaded ? 'live' : 'seed'}-${service.id}`} delay={index * 0.06}>
                <article className='rounded-2xl border border-gold/20 bg-zinc-950 p-5 transition hover:-translate-y-1 hover:border-gold/50'>
                  <h3 className='text-lg font-bold text-gold-soft'>{service.title}</h3>
                  <p className='mt-2 text-sm text-zinc-300'>{service.subtitle}</p>
                  <p className='mt-4 text-3xl font-black'>
                    {service.sedanPrice !== null ? formatStartingPrice(service.sedanPrice) : 'TBD'}
                  </p>
                </article>
              </MotionFade>
          ))}
        </div>
        <div className='mt-6 flex flex-wrap gap-3'>
          <Link href='/services' className='rounded-lg border border-gold/30 px-5 py-3 text-sm font-bold uppercase tracking-wider text-gold-soft'>
            Full service details
          </Link>
          <Link href='/book' className='rounded-lg bg-gold px-5 py-3 text-sm font-bold uppercase tracking-wider text-black'>
            Start booking
          </Link>
        </div>
      </section>

      <section id='gallery' className='border-y border-white/10 bg-black/60 px-4 py-16 sm:px-6 lg:px-8'>
        <div className='mx-auto w-full max-w-7xl'>
          <MotionFade>
            <h2 className='text-2xl font-black uppercase tracking-[0.12em] sm:text-4xl'>Featured transformations</h2>
            <p className='mt-2 max-w-2xl text-sm text-zinc-400'>Live gallery from your CMS — add photos in Admin → Website CMS.</p>
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
            <p className='mt-2 text-zinc-200'>(512) 481-2319 · glossbossatx1@gmail.com</p>
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
            </div>
          </div>
          <SectionErrorBoundary label='Contact form'>
            <ContactForm />
          </SectionErrorBoundary>
        </div>
      </footer>
    </main>
  );
}
