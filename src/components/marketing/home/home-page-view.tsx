'use client';

import {
  ArrowRight,
  Award,
  BadgePercent,
  Clock,
  Flame,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react';
import { BeforeAfterRotator } from '@/components/marketing/before-after-rotator';
import { ContactForm } from '@/components/marketing/contact-form';
import { FeaturedTransformationsSection } from '@/components/marketing/featured-transformations-section';
import { HomeGalleryStrip } from '@/components/marketing/home-gallery-strip';
import { HomepageHeroBackground } from '@/components/marketing/homepage-hero-background';
import { MotionFade } from '@/components/marketing/motion-fade';
import { OffersMarketingBand } from '@/components/marketing/offers-marketing-band';
import { ReviewsCarousel } from '@/components/marketing/reviews-carousel';
import { HomeServicePackagesGrid } from '@/components/marketing/home/home-service-packages-grid';
import { WeatherReadinessWidget } from '@/components/widgets/weather-readiness-widget';
import { PremiumButton } from '@/components/premium/premium-button';
import { PremiumCard } from '@/components/premium/premium-card';
import { PremiumEyebrow } from '@/components/premium/premium-eyebrow';
import { PremiumSection } from '@/components/premium/premium-section';
import { StickyBookCta } from '@/components/premium/sticky-book-cta';
import type { PublicSiteDataState } from '@/hooks/use-public-site-data';
import { isOfferEligiblePublicSiteData } from '@/lib/public-site-data';
import { mediaUrl } from '@/lib/media-registry';
import type { DealConfig, ServicePackage } from '@/lib/site-config';
import { SectionErrorBoundary } from '@/components/site/section-error-boundary';
import { HomeReferralCta } from '@/components/marketing/home-referral-cta';
import { MembershipComparisonSlim } from '@/components/marketing/membership-comparison-slim';

const HOMEPAGE_BRAND_NAME = 'Gloss Boss ATX';

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

const whyChoose = [
  {
    icon: ShieldCheck,
    title: 'Mobile convenience',
    desc: 'We bring water, power, and pro-grade equipment to your driveway.',
  },
  {
    icon: Award,
    title: 'Licensed & insured',
    desc: 'Premium protection and professional standards on every job.',
  },
  {
    icon: Sparkles,
    title: 'Showroom finish',
    desc: 'Paint-safe processes and correction-grade products.',
  },
  {
    icon: Star,
    title: '5-star reputation',
    desc: 'Real Google reviews from Austin clients who book again.',
  },
];

function getObjectStyle(config: { fit?: string; position?: string } | undefined) {
  return {
    objectFit: (config?.fit || 'cover') as React.CSSProperties['objectFit'],
    objectPosition: config?.position || 'center',
  };
}

function isSectionVisible(visuals: Record<string, unknown> | null, key: string) {
  if (!visuals) return true;
  const section = visuals[key] as { published?: boolean } | undefined;
  return section?.published !== false;
}

export function HomePageView({
  state,
  packages,
  deals,
}: {
  state: PublicSiteDataState & { packages: ServicePackage[]; deals: DealConfig };
  packages: ServicePackage[];
  deals: DealConfig;
}) {
  const { visuals, brand, mediaRegistry, reviews, googleReviewUrl, socialLinks, offers, loaded } = state;
  const bookingHref = brand?.publicBookingUrl || '/book';

  const heroImageFromVisuals = (visuals?.hero as { image?: string })?.image?.trim();
  const heroImageUrl = heroImageFromVisuals || brand?.heroVideoPosterUrl || mediaUrl(mediaRegistry, 'homepage.hero');

  const socialButtons = [
    { label: 'Instagram', href: socialLinks.instagramUrl, mark: 'IG' },
    { label: 'TikTok', href: socialLinks.tiktokUrl, mark: 'TT' },
    { label: 'YouTube', href: socialLinks.youtubeUrl, mark: 'YT' },
    { label: 'Facebook', href: socialLinks.facebookUrl, mark: 'FB' },
  ].filter((s) => s.href);

  const hasHomeOffers = offers.some((o) => o.showOnHomepage && isOfferEligiblePublicSiteData(o, new Date()));
  const showMembershipSection =
    isSectionVisible(visuals, 'membership') &&
    (packages.some((p) => /member|bronze|silver|gold/i.test(`${p.id} ${p.title}`)) || deals.websitePromoActive);
  return (
    <main className="gb-page gb-page-pad relative min-h-screen overflow-x-hidden bg-black text-white">
      <StickyBookCta bookingHref={bookingHref} />

      {isSectionVisible(visuals, 'hero') ? (
        <section className="relative flex min-h-[100svh] items-center border-b border-white/5 px-4 pb-20 pt-24 sm:px-6 lg:px-8">
          <HomepageHeroBackground
            imageUrl={heroImageUrl}
            brand={brand}
            objectStyle={getObjectStyle(visuals?.hero as { fit?: string; position?: string })}
          />

          <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-10 xl:grid-cols-[1.15fr_0.85fr]">
            <MotionFade>
              <PremiumCard className="border-gold/15 bg-black/50 backdrop-blur-2xl">
                <PremiumEyebrow>Premium mobile auto detailing</PremiumEyebrow>
                <div className="mt-6 flex items-center gap-4">
                  <img
                    src={brand?.logoUrl ?? '/brand/glossboss-clean-logo.png'}
                    alt={HOMEPAGE_BRAND_NAME}
                    className="h-14 w-auto object-contain sm:h-16"
                  />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-soft">
                      {HOMEPAGE_BRAND_NAME}
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      {brand?.brandCityLabel ?? 'Austin, Texas'}
                    </p>
                  </div>
                </div>

                <h1 className="mt-8 text-4xl font-black uppercase leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl">
                  {(visuals?.hero as { title?: string })?.title ? (
                    (visuals?.hero as { title: string }).title
                  ) : (
                    <>
                      Luxury mobile
                      <br />
                      <span className="gb-text-gold-gradient">detailing</span>
                      <br />
                      at your driveway
                    </>
                  )}
                </h1>

                <p className="mt-6 max-w-xl text-sm leading-relaxed text-zinc-300 sm:text-base">
                  {(visuals?.hero as { subtitle?: string })?.subtitle ||
                    'Luxury mobile detailing in Austin, Texas. Book online in minutes with a secure deposit.'}
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <PremiumButton href={(visuals?.hero as { ctaLink?: string })?.ctaLink || bookingHref}>
                    {(visuals?.hero as { ctaText?: string })?.ctaText || 'Book your detail'}{' '}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </PremiumButton>
                  <PremiumButton href="/services" variant="secondary">
                    View packages
                  </PremiumButton>
                  {socialButtons.length > 0 ? (
                    <div className="flex items-center gap-2 sm:ml-1">
                      {socialButtons.map((s) => (
                        <a
                          key={s.label}
                          href={s.href!}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={s.label}
                          title={s.label}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[10px] font-black uppercase text-zinc-300 transition hover:border-gold/30 hover:text-gold-soft"
                        >
                          {s.mark}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </PremiumCard>
            </MotionFade>

            <MotionFade delay={0.08}>
              <div className="grid gap-4">
                <SectionErrorBoundary label="Before / after">
                  <BeforeAfterRotator />
                </SectionErrorBoundary>
                <SectionErrorBoundary label="Weather">
                  <WeatherReadinessWidget
                    autoFetch
                    variant="customer"
                    locationLabel="Austin service area"
                    className="border-gold/20 bg-black/70 backdrop-blur-xl"
                  />
                </SectionErrorBoundary>
                <PremiumCard hover={false} className="space-y-4 border-gold/20 bg-black/70">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Reserve</p>
                      <h3 className="mt-1 text-lg font-black uppercase text-white">Schedule detailing</h3>
                    </div>
                    <Flame className="h-5 w-5 text-gold" />
                  </div>
                  <p className="text-xs text-zinc-400">
                    30% Stripe deposit locks your slot. Signed checklist and photos on-site.
                  </p>
                  {deals.websitePromoActive && deals.websitePromoPercent > 0 ? (
                    <div className="flex items-center gap-2 rounded-xl border border-gold/20 bg-gold/5 p-3 text-xs text-gold-soft">
                      <BadgePercent className="h-4 w-4 shrink-0" />
                      {deals.websitePromoPercent}% off online bookings
                    </div>
                  ) : null}
                  <PremiumButton href={bookingHref} className="w-full">
                    Reserve appointment <ArrowRight className="h-3.5 w-3.5" />
                  </PremiumButton>
                </PremiumCard>
              </div>
            </MotionFade>
          </div>
        </section>
      ) : null}

      <section className="border-y border-white/5 bg-zinc-950/80 py-10">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 md:grid-cols-4 sm:px-6 lg:px-8">
          {whyChoose.map((item, i) => (
            <MotionFade key={item.title} delay={i * 0.05}>
              <div className="flex flex-col items-center text-center">
                <div className="mb-3 rounded-2xl border border-gold/20 bg-gold/5 p-3">
                  <item.icon className="h-5 w-5 text-gold-soft" />
                </div>
                <p className="text-xs font-black uppercase tracking-wider text-white">{item.title}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">{item.desc}</p>
              </div>
            </MotionFade>
          ))}
        </div>
      </section>

      {isSectionVisible(visuals, 'services') ? (
        <PremiumSection
          id="services"
          eyebrow="Professional packages"
          title={(visuals?.services as { title?: string })?.title || 'Packages built for Austin drivers'}
          subtitle="Austin's standard for paint correction, interior sanitation, and paint protection."
        >
          <HomeServicePackagesGrid packages={packages} visuals={visuals} />
          <div className="mt-10 text-center">
            <PremiumButton href="/services" variant="ghost">
              View all services
            </PremiumButton>
          </div>
        </PremiumSection>
      ) : null}

      {hasHomeOffers ? <OffersMarketingBand offers={offers} placement="homepage" /> : null}

      <section className="px-4 py-12 sm:px-6">
        <HomeReferralCta />
      </section>

      {showMembershipSection ? (
        <section className="relative overflow-hidden border-y border-white/5 py-0">
          <div className="relative min-h-[420px]">
            <img
              src={(visuals?.membership as { image?: string })?.image || mediaUrl(mediaRegistry, 'homepage.membershipCover')}
              alt=""
              style={getObjectStyle(visuals?.membership as { fit?: string; position?: string })}
              className="absolute inset-0 h-full w-full object-cover opacity-30"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/40" />
            <div className="relative mx-auto flex max-w-7xl flex-col justify-center px-4 py-20 sm:px-6 lg:min-h-[420px] lg:px-8">
              <PremiumEyebrow>Memberships</PremiumEyebrow>
              <h2 className="mt-4 max-w-xl text-3xl font-black uppercase tracking-tight text-white sm:text-5xl">
                {(visuals?.membership as { title?: string })?.title || 'Save with recurring shine'}
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-zinc-300">
                {(visuals?.membership as { desc?: string })?.desc ||
                  'Bronze, Silver, and Gold plans with priority scheduling and member pricing.'}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <PremiumButton href={(visuals?.membership as { ctaLink?: string })?.ctaLink || '/memberships'}>
                  {(visuals?.membership as { ctaText?: string })?.ctaText || 'View memberships'}
                </PremiumButton>
                <PremiumButton href="/memberships#pricing-calculator" variant="secondary">
                  Calculate savings
                </PremiumButton>
              </div>
              <MembershipComparisonSlim className="mt-10 max-w-4xl" />
            </div>
          </div>
        </section>
      ) : null}

      <PremiumSection
        id="gallery"
        eyebrow="Our work"
        title="Featured gallery"
        subtitle="Controlled, cropped showcase — full portfolio on the gallery page."
      >
        <SectionErrorBoundary label="Gallery">
          <HomeGalleryStrip maxImages={6} />
        </SectionErrorBoundary>
        <div className="mt-8 text-center">
          <PremiumButton href="/gallery" variant="ghost">
            View full gallery
          </PremiumButton>
        </div>
      </PremiumSection>

      {isSectionVisible(visuals, 'transformations') ? (
        <SectionErrorBoundary label="Transformations">
          <FeaturedTransformationsSection visuals={visuals} />
        </SectionErrorBoundary>
      ) : null}

      {loaded && reviews.length > 0 ? (
        <section className="bg-zinc-950 py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <SectionErrorBoundary label="Reviews">
              <ReviewsCarousel reviews={reviews} googleReviewUrl={googleReviewUrl} bookingHref={bookingHref} />
            </SectionErrorBoundary>
          </div>
        </section>
      ) : null}

      <section id="faq" className="border-t border-white/5 bg-black py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <PremiumEyebrow>FAQ</PremiumEyebrow>
          <h2 className="mt-4 text-3xl font-black uppercase text-white">Before you book</h2>
          <dl className="mt-8 space-y-4">
            {faqs.map((item) => (
              <PremiumCard key={item.q} className="bg-zinc-950/50 p-5" hover={false}>
                <dt className="text-sm font-bold text-white">{item.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-zinc-400">{item.a}</dd>
              </PremiumCard>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <PremiumCard>
            <div className="flex items-center gap-2 border-b border-white/5 pb-3">
              <Clock className="h-4 w-4 text-gold" />
              <p className="text-xs font-black uppercase text-gold-soft">Hours</p>
            </div>
            <ul className="mt-4 space-y-2 text-xs text-zinc-300">
              <li className="flex justify-between"><span>Mon / Tue / Thu / Fri</span><span>5:00–7:30 PM</span></li>
              <li className="flex justify-between"><span>Wed</span><span>Closed</span></li>
              <li className="flex justify-between"><span>Sat / Sun</span><span>7:30 AM–7:00 PM</span></li>
            </ul>
          </PremiumCard>
          <PremiumCard>
            <div className="flex items-center gap-2 border-b border-white/5 pb-3">
              <MapPin className="h-4 w-4 text-gold" />
              <p className="text-xs font-black uppercase text-gold-soft">Service area</p>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-zinc-400">
              Austin and surrounding areas including West Lake Hills, Lakeway, Bee Cave, Cedar Park, Round Rock, and more.
            </p>
          </PremiumCard>
        </div>
      </section>

      {isSectionVisible(visuals, 'finalCta') ? (
        <section className="relative overflow-hidden border-t border-white/5 py-24 text-center">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.12),transparent_55%)]" />
          <div className="relative mx-auto max-w-2xl px-4">
            <h2 className="text-4xl font-black uppercase text-white sm:text-5xl">
              {(visuals?.finalCta as { title?: string })?.title || 'Ready for showroom gloss?'}
            </h2>
            <p className="mt-4 text-sm text-zinc-400">
              {(visuals?.finalCta as { subtitle?: string })?.subtitle ||
                'Book in seconds. Pay deposit securely. We come to you.'}
            </p>
            <div className="mt-8">
              <PremiumButton href={(visuals?.finalCta as { ctaLink?: string })?.ctaLink || bookingHref}>
                {(visuals?.finalCta as { ctaText?: string })?.ctaText || 'Schedule now'}
              </PremiumButton>
            </div>
          </div>
        </section>
      ) : null}

      <footer id="contact" className="border-t border-white/10 bg-black px-4 py-16 sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 lg:flex-row lg:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-gold-soft">{HOMEPAGE_BRAND_NAME}</p>
            <p className="mt-3 text-sm text-zinc-300">
              <a href="tel:+15124812319" className="text-gold-soft hover:text-white">
                (512) 481-2319
              </a>
              <span className="text-zinc-600"> · </span>
              <a href="mailto:glossbossatx1@gmail.com" className="hover:text-gold-soft">
                glossbossatx1@gmail.com
              </a>
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <a href="tel:+15124812319" className="inline-flex items-center gap-2 rounded-xl border border-gold/30 px-4 py-2 text-[10px] font-black uppercase text-gold-soft">
                <Phone className="h-3.5 w-3.5" /> Call
              </a>
              <a href="mailto:glossbossatx1@gmail.com" className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-[10px] font-black uppercase text-zinc-300">
                <Mail className="h-3.5 w-3.5" /> Email
              </a>
              <PremiumButton href={bookingHref} className="!min-h-[40px] !py-2">
                Book
              </PremiumButton>
            </div>
            {socialButtons.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {socialButtons.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-bold uppercase text-zinc-300 hover:border-gold/30 hover:text-gold-soft"
                  >
                    {s.label}
                  </a>
                ))}
              </div>
            ) : null}
            <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">Powered by Titan™</p>
          </div>
          <SectionErrorBoundary label="Contact form">
            <ContactForm />
          </SectionErrorBoundary>
        </div>
      </footer>

      {!loaded ? (
        <p className="sr-only" aria-live="polite">
          Loading site content…
        </p>
      ) : null}
    </main>
  );
}
