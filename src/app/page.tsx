'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Sparkles, X, Check, Star, ShieldCheck, Award, Flame, Calendar, Clock, MapPin, BadgePercent, Zap, Layers, Phone, Mail } from 'lucide-react';
import { BeforeAfterRotator } from '@/components/marketing/before-after-rotator';
import { WeatherReadinessWidget } from '@/components/widgets/weather-readiness-widget';
import { ReviewsCarousel } from '@/components/marketing/reviews-carousel';
import { HomepageHeroBackground } from '@/components/marketing/homepage-hero-background';
import type { PublicBrandPayload } from '@/lib/brand/public-brand-types';
import { ContactForm } from '@/components/marketing/contact-form';
import { FeaturedTransformationsSection } from '@/components/marketing/featured-transformations-section';
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
  type PublicReview,
  type SiteDataOfferCard,
  type SiteDataMultiCar,
} from '@/lib/public-site-data';
import { mediaUrl, type MediaRegistry } from '@/lib/media-registry';

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

const defaultProcessSteps = [
  { title: 'Decontamination & Prep', desc: 'Thorough snow foam hand wash, iron removal, and clay bar treatment to create a perfectly clean slate.', image: 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=600&q=80', fit: 'cover', position: 'center' },
  { title: 'Correction & Enhancement', desc: 'Precision machine compounding and polishing to eliminate swirls, oxidation, light scratches and bring out maximum depth.', image: 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=600&q=80', fit: 'cover', position: 'center' },
  { title: 'Showroom Lock-In Protection', desc: 'Carnauba waxing, paint sealants, or state of the art ceramic coatings applied to lock in deep reflection and chemical resistance.', image: 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=600&q=80', fit: 'cover', position: 'center' }
];

export default function HomePage() {
  const [showPromoPopup, setShowPromoPopup] = useState(true);
  const [services, setServices] = useState<ServicePackage[]>([]);
  const [deals, setDeals] = useState<DealConfig>(emptyDeals);
  const [offers, setOffers] = useState<SiteDataOfferCard[]>([]);
  const [multiCar, setMultiCar] = useState<SiteDataMultiCar | null>(null);
  const [schemaWarnings, setSchemaWarnings] = useState<string[]>([]);
  const [siteLoaded, setSiteLoaded] = useState(false);
  const [googleReviewUrl, setGoogleReviewUrl] = useState('');
  const [socialLinks, setSocialLinks] = useState({ instagramUrl: '', tiktokUrl: '', youtubeUrl: '', facebookUrl: '' });
  const [visuals, setVisuals] = useState<any>(null);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [mediaRegistry, setMediaRegistry] = useState<MediaRegistry>({});
  const [brand, setBrand] = useState<PublicBrandPayload | null>(null);

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
        setGoogleReviewUrl(data.googleReviewUrl ?? '');
        setSocialLinks(data.socialLinks ?? { instagramUrl: '', tiktokUrl: '', youtubeUrl: '', facebookUrl: '' });
        setVisuals(data.homepageVisuals ?? null);
        setReviews(data.reviews ?? []);
        setMediaRegistry(data.mediaRegistry ?? {});
        setBrand(data.brand ?? null);
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

  const hasHomeOffers = useMemo(() => {
    const now = new Date();
    return offers.some((o) => o.showOnHomepage && isOfferEligiblePublicSiteData(o, now));
  }, [offers]);
  const [dismissSchemaNotice, setDismissSchemaNotice] = useState(false);
  const showSchemaNotice = schemaWarnings.length > 0 && !dismissSchemaNotice;
  const socialButtons = [
    { label: 'Instagram', href: socialLinks.instagramUrl, mark: 'IG' },
    { label: 'TikTok', href: socialLinks.tiktokUrl, mark: 'TT' },
    { label: 'YouTube', href: socialLinks.youtubeUrl, mark: 'YT' },
    { label: 'Facebook', href: socialLinks.facebookUrl, mark: 'FB' },
  ].filter((item) => item.href);

  // Visual helper for crop alignment
  const getObjectStyle = (config: any) => {
    return {
      objectFit: (config?.fit || 'cover') as any,
      objectPosition: config?.position || 'center'
    };
  };

  // Section Visibilities based on visuals configuration
  const isSectionVisible = (sectionKey: string) => {
    if (!visuals) return true;
    return visuals[sectionKey]?.published !== false;
  };

  return (
    <main className='gb-page relative min-h-screen text-foreground bg-black overflow-x-hidden'>
      {/* Promo banner popup */}
      {showPromoPopup && displayDeals.websitePromoActive && displayDeals.websitePromoPercent > 0 ? (
        <div
          role='dialog'
          aria-modal='true'
          aria-labelledby='promo-dialog-title'
          className='fixed inset-x-4 top-24 z-[60] mx-auto w-[calc(100%-2rem)] md:max-w-3xl lg:max-w-5xl rounded-3xl border border-gold/30 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 p-6 md:p-8 shadow-[0_0_50px_rgba(212,166,77,0.25)] backdrop-blur-md transition-all duration-300'
        >
          <button
            type='button'
            onClick={() => setShowPromoPopup(false)}
            className='absolute right-4 top-4 rounded-xl border border-white/10 p-2 text-zinc-400 hover:bg-white/10 hover:text-white transition duration-200'
            aria-label='Close offer banner'
          >
            <X size={16} />
          </button>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pr-8">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-gold animate-pulse" />
                <p id='promo-dialog-title' className='text-xs uppercase tracking-[0.25em] font-black text-gold-soft'>
                  {displayDeals.websitePromoLabel || 'Limited Time Booking Special'}
                </p>
              </div>
              <h2 className='text-2xl md:text-3xl lg:text-4xl font-black text-white uppercase tracking-tight'>
                Save <span className='text-gold'>{displayDeals.websitePromoPercent}% OFF</span> Your Next Mobile Detail
              </h2>
              <p className='text-xs md:text-sm text-zinc-300 max-w-2xl leading-relaxed'>
                Limited slots available. Discount applies automatically to eligible detailing packages at checkout. Lock in your slot with a secure deposit today.
              </p>
            </div>
            
            <div className='flex flex-row md:flex-col lg:flex-row gap-3 shrink-0 self-start md:self-center'>
              <Link href='/book' className='inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-6 py-3.5 text-xs font-black uppercase tracking-widest text-black shadow-[0_0_20px_rgba(212,175,55,0.3)] hover:brightness-110 transition duration-300'>
                Claim Offer <ArrowRight size={14} />
              </Link>
              <button
                type='button'
                onClick={() => setShowPromoPopup(false)}
                className='rounded-xl border border-white/20 px-6 py-3.5 text-xs font-black uppercase tracking-widest text-white hover:bg-white/10 transition duration-200'
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* SECTION 1: PREMIUM HERO */}
      {isSectionVisible('hero') && (
        <section className='relative flex min-h-screen items-center border-b border-white/10 px-4 pb-16 pt-28 sm:px-6 lg:px-8 overflow-hidden'>
          <HomepageHeroBackground
            imageUrl={visuals?.hero?.image || mediaUrl(mediaRegistry, 'homepage.hero')}
            brand={brand}
            objectStyle={getObjectStyle(visuals?.hero)}
          />

          <div className='relative z-10 mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[1.25fr_0.75fr]'>
            <MotionFade>
              <div className="gb-glass-card border border-gold/15 p-6 sm:p-10 shadow-[0_0_60px_rgba(212,175,55,0.05)] bg-black/45 backdrop-blur-xl rounded-3xl">
                <div className='mb-6 flex items-center gap-4'>
                  <div className='rounded-2xl border border-gold/25 bg-black/65 p-3 shadow-[0_0_34px_rgba(212,175,55,0.16)]'>
                    <img src={brand?.logoUrl ?? '/brand/glossboss-clean-logo.png'} alt={brand?.businessDisplayName ?? 'Gloss Boss ATX'} className='h-14 w-auto object-contain sm:h-20' />
                  </div>
                  <div>
                    <p className='text-[10px] font-black uppercase tracking-[0.32em] text-gold-soft'>{brand?.businessDisplayName ?? 'Gloss Boss ATX'}</p>
                    <p className='mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400'>{brand?.brandCityLabel ?? 'Austin luxury mobile detailing'}</p>
                  </div>
                </div>
                <p className='inline-flex items-center gap-2 rounded-full border border-gold/30 bg-black/60 px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-gold-soft shadow-[0_0_15px_rgba(212,175,55,0.1)]'>
                  <Sparkles size={12} className="text-gold" /> Premium Mobile Auto Detailing
                </p>
                <h1 className='mt-6 text-4.5xl font-black uppercase leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7.5xl'>
                  {visuals?.hero?.title ? (
                    visuals.hero.title
                  ) : (
                    <>
                      Luxury Mobile
                      <br />
                      <span className='gb-text-gold-gradient'>Detailing</span>
                      <br />
                      In Austin, Texas
                    </>
                  )}
                </h1>
                <p className='mt-6 max-w-xl text-sm leading-relaxed text-zinc-300 sm:text-base'>
                  {visuals?.hero?.subtitle || 'Mobile detailing at your driveway — book online in minutes, pay deposit securely, and get showroom results without waiting at a shop.'}
                </p>
                
                <div className='mt-8 flex flex-col gap-3 sm:flex-row'>
                  <Link href={visuals?.hero?.ctaLink || '/book'} className='inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-gold via-gold-soft to-gold px-8 py-4 text-xs font-black uppercase tracking-[0.15em] text-black shadow-[0_0_35px_rgba(212,175,55,0.35)] hover:brightness-110 transition duration-300'>
                    {visuals?.hero?.ctaText || 'Book your detail'} <ArrowRight size={14} />
                  </Link>
                  <Link href='/services' className='inline-flex items-center justify-center rounded-xl border border-white/20 bg-black/40 px-6 py-4 text-xs font-black uppercase tracking-[0.12em] text-white hover:border-gold/40 transition duration-300'>
                    View packages
                  </Link>
                  <Link href='/services' className='rounded-xl border border-white/20 bg-black/45 px-8 py-4 text-center text-xs font-black uppercase tracking-[0.15em] text-white hover:border-gold/50 hover:text-gold-soft transition duration-300'>
                    View Services
                  </Link>
                </div>

                <div className='gb-premium-card mt-8 rounded-2xl border border-gold/15 bg-black/55 p-4 text-base shadow-[0_0_28px_rgba(212,175,55,0.08)] sm:p-5'>
                  <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Quick Contact</p>
                  <div className='mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap'>
                    <a href='tel:+15124812319' className='inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-gold/35 bg-gold/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-gold-soft transition hover:bg-gold hover:text-black'>
                      <Phone className="h-4 w-4" /> Call
                    </a>
                    <a href='mailto:glossbossatx1@gmail.com' className='inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:border-gold/40 hover:text-gold-soft'>
                      <Mail className="h-4 w-4" /> Email
                    </a>
                    {socialButtons.map((social) => (
                      <a
                        key={social.label}
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className='inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-black uppercase tracking-wider text-zinc-200 transition hover:border-gold/40 hover:text-gold-soft'
                      >
                        <span className="grid h-5 w-5 place-items-center rounded-md border border-gold/25 text-[9px] font-black text-gold-soft">{social.mark}</span> {social.label}
                      </a>
                    ))}
                  </div>
                  <p className='mt-3 text-xs text-zinc-500'>Austin, Texas & surrounding areas</p>
                </div>
              </div>
            </MotionFade>

            {/* SECTION 3: BOOKING CTA WIDGET */}
            <MotionFade delay={0.1}>
              <div className='grid gap-4 sm:grid-cols-1'>
                <SectionErrorBoundary label='Before / after rotator'>
                  <BeforeAfterRotator />
                </SectionErrorBoundary>
                
                <SectionErrorBoundary label='Weather forecast'>
                  <WeatherReadinessWidget autoFetch variant="customer" locationLabel="Austin service area" className="bg-black/75 backdrop-blur-xl border-gold/20 shadow-[0_0_35px_rgba(212,175,55,0.05)]" />
                </SectionErrorBoundary>
                
                <article className='rounded-3xl border border-gold/20 bg-black/70 p-6 backdrop-blur shadow-xl space-y-4'>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className='text-xs uppercase tracking-[0.2em] text-gold-soft font-black'>Austin Reserve</p>
                      <h3 className='mt-1 text-lg font-black text-white uppercase'>Schedule Auto Detailing</h3>
                    </div>
                    <Flame className="h-5 w-5 text-gold animate-bounce" />
                  </div>
                  
                  <p className="text-xs text-zinc-400">
                    Secure your booking date with a 30% Stripe deposit. Zero hassle. Custom invoices and signed checklists completed directly on your driveway.
                  </p>

                  <div className="border-t border-white/5 pt-4 space-y-2">
                    {displayDeals.websitePromoActive && displayDeals.websitePromoPercent > 0 && (
                      <div className="flex items-center gap-2 text-xs text-gold-soft bg-gold/5 border border-gold/20 p-2.5 rounded-xl">
                        <BadgePercent className="h-4 w-4 shrink-0" />
                        <span>Online bookings receive a <strong>{displayDeals.websitePromoPercent}% discount</strong>.</span>
                      </div>
                    )}
                    {displayDeals.multiCarSecondVehicleDiscountPercent > 0 && (
                      <div className="flex items-center gap-2 text-xs text-zinc-300 bg-white/5 border border-white/5 p-2.5 rounded-xl">
                        <Zap className="h-4 w-4 shrink-0 text-gold" />
                        <span>Save <strong>{displayDeals.multiCarSecondVehicleDiscountPercent}%</strong> on a second vehicle.</span>
                      </div>
                    )}
                  </div>

                  <Link href="/book" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gold py-4 text-xs font-black uppercase tracking-wider text-black transition hover:brightness-110 shadow-lg">
                    Reserve Appointment <ArrowRight className="h-4 w-4" />
                  </Link>

                  {googleReviewUrl && (
                    <a
                      href={googleReviewUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='flex items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/5 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-gold-soft hover:bg-gold/10 transition'
                    >
                      <Star className="h-4 w-4 fill-gold text-gold" /> Read Our Google Reviews
                    </a>
                  )}
                </article>
              </div>
            </MotionFade>
          </div>
        </section>
      )}

      {/* SECTION 2: TRUST STRIP */}
      <section className="bg-zinc-950 border-y border-white/5 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-5 text-center">
            {[
              { icon: ShieldCheck, label: 'Mobile Detailing', desc: 'We bring water & power' },
              { icon: Award, label: 'Licensed & Insured', desc: 'Full premium protection' },
              { icon: Sparkles, label: 'Showroom Finish', desc: 'Premium grade products' },
              { icon: Star, label: '5-Star Rated', desc: 'Top Austin detailer' },
              { icon: Check, label: '100% Satisfaction', desc: 'Guaranteed quality' },
            ].map((item, idx) => (
              <MotionFade key={idx} delay={idx * 0.05}>
                <div className="flex flex-col items-center space-y-2">
                  <div className="p-2 bg-gold/10 rounded-full border border-gold/20">
                    <item.icon className="h-5 w-5 text-gold-soft" />
                  </div>
                  <p className="text-xs font-black uppercase tracking-wider text-white">{item.label}</p>
                  <p className="text-[10px] text-zinc-500">{item.desc}</p>
                </div>
              </MotionFade>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 4: SERVICES PREVIEW */}
      {isSectionVisible('services') && (
        <section id='services' className='mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8' aria-busy={!siteLoaded}>
          <MotionFade>
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft bg-gold/5 border border-gold/20 px-3.5 py-1.5 rounded-full">Professional Packages</span>
              <h2 className="text-3xl font-black uppercase tracking-tight text-white sm:text-5xl mt-3">
                {visuals?.services?.title || 'Premium Service Packages'}
              </h2>
              <p className="text-sm text-zinc-400">
                 Austin’s standard for paint correction, interior sanitation, and paint protection.
              </p>
            </div>
          </MotionFade>

          <div className='mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 pr-8 [-ms-overflow-style:none] [scrollbar-width:none] md:grid md:snap-none md:grid-cols-2 md:overflow-visible md:pb-0 md:pr-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden'>
            {packagesForGrid.map((service, index) => {
              // Load covers from custom visuals configuration
              const visualCover = visuals?.services?.covers?.[service.id];
              const coverUrl = visualCover?.image || {
                'full-detail': 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=800&q=80',
                'exterior-wash': 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=800&q=80',
                'exterior-detail': 'https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=800&q=80',
                'interior-detail': 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=800&q=80',
                'ceramic-coating': 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=800&q=80'
              }[service.id] || 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=800&q=80';

              return (
                <MotionFade key={`${siteLoaded ? 'live' : 'seed'}-${service.id}`} delay={index * 0.06}>
                  <div className="min-w-[82%] snap-start sm:min-w-[58%] md:min-w-0">
                  <article className='group rounded-3xl border border-gold/15 bg-zinc-950/80 overflow-hidden transition duration-300 hover:-translate-y-1.5 hover:border-gold/45 shadow-lg flex flex-col h-full'>
                    <div className="relative aspect-[16/10] overflow-hidden border-b border-white/5 bg-zinc-900">
                      <img
                        src={coverUrl}
                        alt={service.title}
                        style={getObjectStyle(visualCover)}
                        className="w-full h-full transition duration-500 group-hover:scale-105"
                      />
                    </div>
                    <div className="p-5 flex flex-col flex-1 justify-between">
                      <div>
                        <h3 className='text-lg font-black uppercase text-gold-soft tracking-tight'>{service.title}</h3>
                        <p className='mt-2 text-xs text-zinc-400 leading-relaxed line-clamp-3'>{service.subtitle}</p>
                        
                        <ul className="mt-4 space-y-1.5 border-t border-white/5 pt-3">
                          {(service.includes || []).slice(0, 4).map((inc, i) => (
                            <li key={i} className="flex items-center gap-2 text-[11px] text-zinc-300">
                              <Check className="h-3.5 w-3.5 text-gold shrink-0" />
                              <span className="truncate">{inc}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      
                      <div className="mt-6 pt-3 border-t border-white/5 flex items-center justify-between">
                        <div>
                          <p className="text-[9px] uppercase tracking-wider text-zinc-500">Starting price</p>
                          <p className='text-2xl font-black text-white'>
                            {formatStartingPrice(service.sedanPrice)}
                          </p>
                        </div>
                        <Link href="/book" className="p-2.5 rounded-xl bg-gold/10 group-hover:bg-gold text-gold-soft group-hover:text-black transition">
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  </article>
                  </div>
                </MotionFade>
              );
            })}
          </div>
          <div className="mt-8 space-y-1 text-center">
            <p className='max-w-3xl mx-auto text-[10px] leading-relaxed text-zinc-500'>{PRICING_DISCLAIMER}</p>
            <p className='max-w-3xl mx-auto text-[10px] leading-relaxed text-zinc-500'>{PRICING_DISCOUNT_RULES}</p>
          </div>
        </section>
      )}

      {/* SECTION 5: FEATURED TRANSFORMATIONS */}
      {isSectionVisible('featuredTransformations') && (
        <section id='gallery' className='border-y border-white/5 bg-black/90 px-4 py-20 sm:px-6 lg:px-8'>
          <div className="mx-auto w-full max-w-7xl">
            <MotionFade>
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft bg-gold/5 border border-gold/20 px-3.5 py-1.5 rounded-full">Before & After Showcase</span>
                  <h2 className="text-3xl font-black uppercase tracking-tight text-white sm:text-5xl mt-3">
                    {visuals?.featuredTransformations?.title || 'Featured Transformations'}
                  </h2>
                  <p className="text-sm text-zinc-400 mt-1">
                    Drag the center slider on each card to reveal restoration transformations.
                  </p>
                </div>
                <Link href='/gallery' className='text-xs font-black uppercase tracking-wider text-gold-soft border-b border-gold/30 pb-0.5 hover:text-white transition whitespace-nowrap self-start md:self-auto'>
                  View Transformation Portfolio →
                </Link>
              </div>
            </MotionFade>
            <SectionErrorBoundary label='Gallery'>
              <FeaturedTransformationsSection visuals={visuals} />
            </SectionErrorBoundary>
          </div>
        </section>
      )}

      {/* SECTION 6: MEMBERSHIPS PREVIEW */}
      {isSectionVisible('membership') && (
        <section className='relative overflow-hidden border-b border-white/5 bg-zinc-950 px-4 py-20 sm:px-6 lg:px-8'>
          <div className='absolute inset-0 z-0'>
            <img
              src={visuals?.membership?.image || mediaUrl(mediaRegistry, 'homepage.membershipCover')}
              alt='Memberships Banner'
              style={getObjectStyle(visuals?.membership)}
              className="absolute inset-0 w-full h-full opacity-10"
            />
            <div className='absolute inset-0 bg-gradient-to-r from-black via-zinc-950/95 to-transparent' />
          </div>
          <div className='relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center'>
            <MotionFade>
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft bg-gold/5 border border-gold/20 px-3.5 py-1.5 rounded-full">Gloss Boss Club</span>
                <h2 className='mt-4 text-3xl font-black uppercase leading-tight text-white sm:text-5xl'>
                  {visuals?.membership?.title || 'Save with recurring shine.'}
                </h2>
                <p className='mt-4 max-w-2xl text-sm leading-relaxed text-zinc-300'>
                  {visuals?.membership?.desc || 'Bronze, Silver, and Gold plans keep your vehicle protected with priority scheduling, member pricing, and a digital punch-card reward built for repeat clients.'}
                </p>
                <div className='mt-8 flex flex-wrap gap-3'>
                  <Link href={visuals?.membership?.ctaLink || '/memberships'} className='rounded-xl bg-gold px-6 py-3.5 text-xs font-black uppercase tracking-wider text-black shadow-[0_0_26px_rgba(212,175,55,0.25)] hover:brightness-110 transition'>
                    {visuals?.membership?.ctaText || 'View Memberships'}
                  </Link>
                  <Link href='/memberships#pricing-calculator' className='rounded-xl border border-gold/35 bg-gold/5 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-gold-soft hover:bg-gold/10 transition'>
                    Join Monthly Plan
                  </Link>
                </div>
              </div>
            </MotionFade>
            <MotionFade delay={0.08}>
              <div className='grid gap-4 sm:grid-cols-3'>
                {[
                  { val: '5', lbl: 'Paid Stamps Punch Card' },
                  { val: '25%', lbl: 'Yearly Savings Target' },
                  { val: '3', lbl: 'Premium Tiers Available' },
                ].map((stat, i) => (
                  <div key={i} className='rounded-2xl border border-gold/15 bg-black/60 p-5 text-center backdrop-blur-sm'>
                    <p className='text-4xl font-black text-gold-soft'>{stat.val}</p>
                    <p className='mt-2 text-[10px] font-black uppercase tracking-wider text-zinc-400'>{stat.lbl}</p>
                  </div>
                ))}
              </div>
            </MotionFade>
          </div>
        </section>
      )}

      {/* SECTION 7: FLEET PREVIEW */}
      {isSectionVisible('fleet') && (
        <section className='relative overflow-hidden border-b border-white/5 bg-black px-4 py-20 sm:px-6 lg:px-8'>
          <div className='absolute inset-0 z-0'>
            <img
              src={visuals?.fleet?.image || mediaUrl(mediaRegistry, 'homepage.fleetCover')}
              alt='Fleet Cover'
              style={getObjectStyle(visuals?.fleet)}
              className="absolute inset-0 w-full h-full opacity-10"
            />
            <div className='absolute inset-0 bg-gradient-to-l from-black via-black/95 to-transparent' />
          </div>
          <div className='relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center'>
            <MotionFade delay={0.05}>
              <div className="relative border border-white/10 rounded-3xl overflow-hidden aspect-[4/3] bg-zinc-900 shadow-2xl">
                <img
                  src={visuals?.fleet?.image || mediaUrl(mediaRegistry, 'homepage.fleetCover')}
                  alt='Fleet Image Show'
                  style={getObjectStyle(visuals?.fleet)}
                  className="w-full h-full object-cover"
                />
              </div>
            </MotionFade>
            <MotionFade>
              <div className="space-y-4">
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft bg-gold/5 border border-gold/20 px-3.5 py-1.5 rounded-full">Commercial Accounts</span>
                <h2 className='text-3xl font-black uppercase leading-tight text-white sm:text-5xl'>
                  {visuals?.fleet?.title || 'Fleet & Corporate Programs'}
                </h2>
                <p className='text-sm leading-relaxed text-zinc-300'>
                  {visuals?.fleet?.desc || 'We offer customized mobile auto detailing for commercial fleets, dealership inventories, corporate parks, and luxury shuttle companies with volume discount tiers.'}
                </p>
                <div className="pt-2">
                  <Link href={visuals?.fleet?.ctaLink || '/fleet'} className='inline-block rounded-xl bg-gradient-to-r from-gold to-gold-soft px-8 py-3.5 text-xs font-black uppercase tracking-wider text-black transition hover:brightness-110 shadow-lg'>
                    {visuals?.fleet?.ctaText || 'Fleet Inquiries'}
                  </Link>
                </div>
              </div>
            </MotionFade>
          </div>
        </section>
      )}

      {/* SECTION 8: PRODUCTS/TOOLS/PROCESS SECTION */}
      {isSectionVisible('process') && (
        <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 border-b border-white/5">
          <MotionFade>
            <div className="text-center max-w-2xl mx-auto space-y-2 mb-12">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft bg-gold/5 border border-gold/20 px-3.5 py-1.5 rounded-full">SOP Standards</span>
              <h2 className="text-3xl font-black uppercase tracking-tight text-white sm:text-5xl mt-3">
                {visuals?.process?.title || 'The Gloss Boss Professional Process'}
              </h2>
              <p className="text-sm text-zinc-400">
                Every vehicle completes a multi-stage quality protocol designed for showroom depth.
              </p>
            </div>
          </MotionFade>

          <div className="grid gap-6 md:grid-cols-3">
            {(visuals?.process?.steps || defaultProcessSteps).map((step: any, idx: number) => (
              <MotionFade key={idx} delay={idx * 0.08}>
                <article className="rounded-3xl border border-white/5 bg-zinc-950 p-5 flex flex-col justify-between h-full space-y-4">
                  <div className="space-y-4">
                    <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
                      <img
                        src={step.image}
                        alt={step.title}
                        style={getObjectStyle(step)}
                        className="w-full h-full"
                      />
                      <span className="absolute left-3 top-3 rounded-lg bg-black/80 border border-gold/20 px-2 py-0.5 text-[10px] font-mono font-black text-gold-soft">
                        STAGE 0{idx + 1}
                      </span>
                    </div>
                    <h3 className="text-lg font-black uppercase text-white tracking-tight">{step.title}</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">{step.desc}</p>
                  </div>
                </article>
              </MotionFade>
            ))}
          </div>
        </section>
      )}

      {/* SECTION 9: TESTIMONIALS/REVIEWS */}
      <section className="bg-zinc-950 border-b border-white/5 py-20">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-8">
          <SectionErrorBoundary label='Reviews Carousel'>
            <ReviewsCarousel reviews={reviews} />
          </SectionErrorBoundary>
        </div>
      </section>

      {socialButtons.length > 0 ? (
        <section className="border-b border-white/5 bg-black px-4 py-16 sm:px-6 lg:px-8">
          <MotionFade>
            <div className="mx-auto grid max-w-7xl gap-8 rounded-3xl border border-gold/15 bg-zinc-950/70 p-6 shadow-[0_0_36px_rgba(212,175,55,0.06)] sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft">Watch our work</span>
                <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">Follow the shine</h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
                  See recent transformations, behind-the-scenes details, and fresh mobile detailing results from Austin driveways.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:justify-end">
                {socialButtons.map((social) => (
                  <a
                    key={`proof-${social.label}`}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/60 px-5 py-3 text-xs font-black uppercase tracking-wider text-zinc-200 transition hover:border-gold/40 hover:text-gold-soft"
                  >
                    <span className="grid h-5 w-5 place-items-center rounded-md border border-gold/25 text-[9px] font-black text-gold-soft">{social.mark}</span> {social.label}
                  </a>
                ))}
              </div>
            </div>
          </MotionFade>
        </section>
      ) : null}

      {/* SECTION 10: HOURS & SERVICE AREA */}
      <section className='mx-auto w-full max-w-5xl px-4 py-20 sm:px-6 border-b border-white/5'>
        <MotionFade>
          <div className="text-center max-w-xl mx-auto mb-10">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft bg-gold/5 border border-gold/20 px-3.5 py-1.5 rounded-full">Hours & Operations</span>
            <h2 className='text-3xl font-black uppercase tracking-tight text-white sm:text-4xl mt-3'>Austin Service Area</h2>
          </div>
          <div className='grid gap-6 sm:grid-cols-2'>
            <article className='rounded-3xl border border-gold/15 bg-zinc-950 p-6 space-y-4'>
              <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                <Clock className="h-4 w-4 text-gold" />
                <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Operating hours</p>
              </div>
              <ul className='space-y-3 text-xs text-zinc-300'>
                <li className="flex justify-between border-b border-white/5 pb-1"><span className='font-bold text-white'>Monday</span> <span>5:00 PM - 7:30 PM</span></li>
                <li className="flex justify-between border-b border-white/5 pb-1"><span className='font-bold text-white'>Tuesday</span> <span>5:00 PM - 7:30 PM</span></li>
                <li className="flex justify-between border-b border-white/5 pb-1"><span className='font-bold text-white'>Wednesday</span> <span>Closed</span></li>
                <li className="flex justify-between border-b border-white/5 pb-1"><span className='font-bold text-white'>Thursday</span> <span>5:00 PM - 7:30 PM</span></li>
                <li className="flex justify-between border-b border-white/5 pb-1"><span className='font-bold text-white'>Friday</span> <span>5:00 PM - 7:30 PM</span></li>
                <li className="flex justify-between border-b border-white/5 pb-1"><span className='font-bold text-white'>Saturday</span> <span>7:30 AM - 7:00 PM</span></li>
                <li className="flex justify-between"><span className='font-bold text-white'>Sunday</span> <span>7:30 AM - 7:00 PM</span></li>
              </ul>
            </article>
            <article className='rounded-3xl border border-gold/15 bg-zinc-950 p-6 space-y-4'>
              <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                <MapPin className="h-4 w-4 text-gold" />
                <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Austin Service Coverage</p>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                We travel directly to your location in Austin and surrounding areas, including:
              </p>
              <p className="text-xs text-zinc-400 font-bold">
                West Lake Hills, Lakeway, Bee Cave, Downtown Austin, Cedar Park, Round Rock, Pflugerville, Buda, Kyle, and Rollingwood.
              </p>
            </article>
          </div>
        </MotionFade>
      </section>

      {/* SECTION 11: FINAL CTA */}
      {isSectionVisible('finalCta') && (
        <section className='relative overflow-hidden bg-zinc-950 border-t border-white/5 py-24 px-4 sm:px-6 lg:px-8 text-center'>
          <div className='absolute inset-0 z-0'>
            <img
              src={visuals?.finalCta?.image || mediaUrl(mediaRegistry, 'homepage.finalCta')}
              alt='Final CTA Background'
              style={getObjectStyle(visuals?.finalCta)}
              className="absolute inset-0 w-full h-full opacity-15"
            />
            <div className='absolute inset-0 bg-gradient-to-t from-black via-zinc-950/90 to-transparent' />
          </div>
          <div className='relative z-10 max-w-3xl mx-auto space-y-6'>
            <h2 className='text-4xl font-black uppercase tracking-tight text-white sm:text-6xl'>
              {visuals?.finalCta?.title || 'Ready for Showroom Gloss?'}
            </h2>
            <p className='text-sm leading-relaxed text-zinc-300 max-w-xl mx-auto'>
              {visuals?.finalCta?.subtitle || 'Book your premium mobile service in seconds. Pay a 30% secure Stripe deposit, sign on-site, and enjoy ultimate convenience.'}
            </p>
            <div className="pt-4">
              <Link href={visuals?.finalCta?.ctaLink || '/book'} className='inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-gold via-gold-soft to-gold px-10 py-4.5 text-xs font-black uppercase tracking-widest text-black shadow-[0_0_35px_rgba(212,175,55,0.3)] hover:brightness-110 transition duration-300'>
                {visuals?.finalCta?.ctaText || 'Schedule Now'} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer id='contact' className='border-t border-white/10 bg-black/85 px-4 py-16 sm:px-6'>
        <div className='mx-auto flex w-full max-w-7xl flex-col gap-10 lg:flex-row lg:items-start lg:justify-between'>
          <div className='flex-1'>
            <p className='text-sm uppercase tracking-[0.2em] text-gold-soft font-black'>Gloss Boss ATX</p>
            <p className='mt-2 text-zinc-200'>
              <a href='tel:+15124812319' className='text-gold-soft underline decoration-gold/40 underline-offset-2 hover:text-white'>
                (512) 481-2319
              </a>
              <span className='text-zinc-500'> · </span>
              <a href='mailto:glossbossatx1@gmail.com' className='hover:text-gold-soft'>
                glossbossatx1@gmail.com
              </a>
            </p>
            <p className='text-zinc-400 text-xs mt-1'>Austin, Texas & surrounding areas</p>
            <div className='mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap'>
              {socialButtons.map((social) => (
                <a key={`footer-${social.label}`} href={social.href} target="_blank" rel="noopener noreferrer" className='inline-flex items-center justify-center gap-2 rounded-lg border border-gold/40 px-5 py-3 text-center text-xs font-bold uppercase tracking-widest text-gold-soft hover:bg-gold/5 transition'>
                  <span className="grid h-5 w-5 place-items-center rounded-md border border-gold/25 text-[9px] font-black text-gold-soft">{social.mark}</span> {social.label}
                </a>
              ))}
              <Link href='/book' className='rounded-lg bg-gold px-5 py-3 text-center text-xs font-bold uppercase tracking-widest text-black hover:brightness-110 transition'>
                Reserve Appointment
              </Link>
              <Link href='/gift-cards' className='rounded-lg border border-white/20 px-5 py-3 text-center text-xs font-bold uppercase tracking-widest text-white hover:bg-white/5 transition'>
                Gift Cards
              </Link>
            </div>
            <nav className='mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-xs font-bold uppercase tracking-wider' aria-label='Legal'>
              <Link href='/privacy' className='text-zinc-400 transition hover:text-gold-soft'>
                Privacy Policy
              </Link>
              <Link href='/terms' className='text-zinc-400 transition hover:text-gold-soft'>
                Terms &amp; Conditions
              </Link>
            </nav>
            <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600">
              Powered by Titan™
            </p>
          </div>
          <SectionErrorBoundary label='Contact form'>
            <ContactForm />
          </SectionErrorBoundary>
        </div>
      </footer>
    </main>
  );
}
