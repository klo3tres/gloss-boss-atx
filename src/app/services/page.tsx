"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Clock, Check, Sparkles, AlertTriangle, ShieldCheck, Zap, Compass, Star } from "lucide-react";
import {
  defaultServicePackages,
  formatVehiclePrice,
  PRICING_DISCLAIMER,
  PRICING_DISCOUNT_RULES,
  PUBLIC_ADDON_PRICING,
  type DealConfig,
  type ServicePackage,
} from "@/lib/site-config";
import {
  isOfferEligiblePublicSiteData,
  type PublicSiteDataPayload,
  type SiteDataMultiCar,
  type SiteDataOfferCard,
} from "@/lib/public-site-data";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { OffersMarketingBand } from "@/components/marketing/offers-marketing-band";
import { FleetInquiryForm } from "@/components/public/fleet-inquiry-form";

const emptyDeals: DealConfig = {
  websitePromoPercent: 0,
  websitePromoLabel: "",
  websitePromoActive: false,
  multiCarSecondVehicleDiscountPercent: 0,
  promoStacksWithMultiCar: true,
};

const SERVICE_PRESENTATION = [
  {
    match: ['exterior wash', 'exterior-wash'],
    image: '/assets/exterior_wash_driveway_1780872964011.png',
    ideal: 'Weekly upkeep, pollen resets, and driveway maintenance visits.',
  },
  {
    match: ['exterior detail', 'exterior-detail'],
    image: '/assets/black_detailer_driveway_1780873080456.png',
    ideal: 'Paint-safe gloss recovery before events, sales, or seasonal resets.',
  },
  {
    match: ['interior detail', 'interior-detail', 'interior'],
    image: '/assets/interior_detail_driveway_1780872974449.png',
    ideal: 'Daily drivers, family vehicles, pet hair, spills, and cabin refreshes.',
  },
  {
    match: ['full detail', 'full-detail', 'full'],
    image: '/assets/full_detail_driveway_no_people_1780873155626.png',
    ideal: 'Complete interior and exterior reset for vehicles that need everything.',
  },
  {
    match: ['ceramic', 'coating'],
    image: '/assets/ceramic_coating_driveway_1780872997033.png',
    ideal: 'Longer-term protection, deeper gloss, easier washing, and premium finish care.',
  },
];

function servicePresentation(service: ServicePackage) {
  const text = `${service.id} ${service.title} ${service.subtitle ?? ''}`.toLowerCase();
  return SERVICE_PRESENTATION.find((item) => item.match.some((m) => text.includes(m))) ?? SERVICE_PRESENTATION[0];
}

function fmtMoney(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

export default function ServicesPage() {
  const [dismissSchemaNotice, setDismissSchemaNotice] = useState(false);
  const [services, setServices] = useState<ServicePackage[]>([]);
  const [deals, setDeals] = useState<DealConfig>(emptyDeals);
  const [multiCar, setMultiCar] = useState<SiteDataMultiCar | null>(null);
  const [offers, setOffers] = useState<SiteDataOfferCard[]>([]);
  const [schemaWarnings, setSchemaWarnings] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [fleetEnabled, setFleetEnabled] = useState(false);
  const [fleetBlurb, setFleetBlurb] = useState("");
  const [fleetPricing, setFleetPricing] = useState<PublicSiteDataPayload["fleetPricing"] | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'exterior' | 'interior' | 'full' | 'ceramic' | 'memberships'>('all');

  const packages = !loaded ? [] : services.length > 0 ? services : defaultServicePackages;
  const displayDeals = loaded ? deals : emptyDeals;
  const showSchemaNotice = schemaWarnings.length > 0 && !dismissSchemaNotice;
  const showCatalogFallbackNote = loaded && services.length === 0;

  useEffect(() => {
    let cancelled = false;
    const tid = window.setTimeout(() => {
      if (!cancelled) {
        setSchemaWarnings((w) => (w.length ? w : ["Public site data request timed out — showing defaults."]));
        setLoaded(true);
      }
    }, 10000);
    fetchWithTimeout("/api/public/site-data", { cache: "no-store", timeoutMs: 8000 })
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
        setMultiCar(data.multiCar ?? null);
        setOffers(data.offers ?? []);
        setFleetEnabled(Boolean(data.fleetServicesEnabled));
        setFleetBlurb(String(data.fleetServicesBlurb ?? ""));
        setFleetPricing(data.fleetPricing ?? null);
        setSchemaWarnings(data.schemaWarnings ?? []);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setSchemaWarnings(["Could not load public site data."]);
          setLoaded(true);
        }
      })
      .finally(() => clearTimeout(tid));
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, []);

  const multiCarLine = useMemo(() => {
    if (!multiCar || !loaded) return null;
    return `Example: two ${multiCar.serviceSlug.replace(/-/g, " ")} (${multiCar.vehicleClass.replace("_", " ")}) — ${fmtMoney(multiCar.firstCents)} + ${fmtMoney(multiCar.secondCents)} = ${fmtMoney(multiCar.totalCents)} total.`;
  }, [multiCar, loaded]);

  const hasServiceOffers = useMemo(() => {
    const now = new Date();
    return offers.some((o) => o.showOnServices && isOfferEligiblePublicSiteData(o, now));
  }, [offers]);

  const showPromosBand =
    loaded &&
    ((displayDeals.websitePromoActive && displayDeals.websitePromoPercent > 0) || hasServiceOffers);

  const visiblePackages = packages.filter((service) => {
    const text = `${service.title} ${service.subtitle ?? ''}`.toLowerCase();
    if (activeTab === 'all') return true;
    if (activeTab === 'memberships') return false;
    if (activeTab === 'full') return text.includes('full') || (text.includes('detail') && !text.includes('exterior') && !text.includes('interior'));
    if (activeTab === 'ceramic') return text.includes('ceramic') || text.includes('coating');
    if (activeTab === 'exterior') return text.includes('exterior') && !text.includes('full');
    if (activeTab === 'interior') return text.includes('interior') && !text.includes('full');
    return text.includes(activeTab);
  });

  const serviceCards = visiblePackages.length > 0 ? visiblePackages : packages;

  const formatDuration = (min?: number | null, max?: number | null) => {
    if (!min && !max) return null;
    const lo = min ?? max ?? 0;
    const hi = max ?? min ?? 0;
    if (lo >= 1440 || hi >= 1440) {
      const minDays = Math.max(1, Math.round(lo / 1440));
      const maxDays = Math.max(minDays, Math.round(hi / 1440));
      return minDays === maxDays ? `${minDays} day` : `${minDays} - ${maxDays} days`;
    }
    return lo === hi ? `${lo} min` : `${lo} - ${hi} min`;
  };

  const getDuration = (service: ServicePackage) => {
    const fromData = formatDuration(service.estimatedMinMinutes, service.estimatedMaxMinutes);
    if (fromData) return fromData;
    const id = service.id;
    const sId = id.toLowerCase();
    if (sId.includes("exterior-wash") || sId.includes("exterior_wash")) return "60 - 90 min";
    if (sId.includes("exterior-detail") || sId.includes("exterior_detail")) return "120 - 180 min";
    if (sId.includes("interior")) return "90 - 150 min";
    if (sId.includes("full")) return "180 - 240 min";
    if (sId.includes("ceramic")) return "1 - 2 days";
    return "90 - 120 min";
  };

  // Driveway backgrounds for each tab
  const getTabBackground = () => {
    if (activeTab === 'exterior') return '/assets/exterior_wash_driveway_1780872964011.png';
    if (activeTab === 'interior') return '/assets/interior_detail_driveway_1780872974449.png';
    if (activeTab === 'full') return '/assets/full_detail_driveway_no_people_1780873155626.png';
    if (activeTab === 'ceramic') return '/assets/ceramic_coating_driveway_1780872997033.png';
    return '/assets/black_detailer_driveway_1780873080456.png';
  };

  return (
    <main className="gb-luxury-page min-h-screen bg-black pb-24 text-foreground">
      {/* Category-Specific Hero Banner */}
      <section className="relative w-full h-[45vh] min-h-[350px] flex items-center justify-center overflow-hidden border-b border-gold/15 mb-12">
        <Image
          src={getTabBackground()}
          alt={`Gloss Boss ATX ${activeTab}`}
          fill
          priority
          className="object-cover object-center opacity-40 brightness-75 scale-102 transition-all duration-700"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-transparent to-black" />

        <div className="relative z-10 max-w-4xl px-6 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-gold">
            Premium Mobile Auto Detailing
          </p>
          <h1 className="mt-3 text-4xl font-black uppercase tracking-tight text-white sm:text-5xl leading-none">
            {activeTab === 'all' ? 'All Premium Services' : activeTab === 'full' ? 'Full Detail Packages' : activeTab === 'ceramic' ? 'Ceramic Protective Coating' : `${activeTab} Detailing`}
          </h1>
          <p className="mt-3 max-w-2xl mx-auto text-xs sm:text-sm text-zinc-300 leading-relaxed">
            Professional mobile detailing at your doorstep. We supply our own spot-free filtered water, electricity, and premium chemicals.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Navigation Tabs */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex flex-wrap justify-center gap-2 rounded-2xl border border-white/10 bg-black/60 p-1.5 backdrop-blur-md">
            {[
              ['all', 'All Services'],
              ['exterior', 'Exterior Detailing'],
              ['interior', 'Interior Detailing'],
              ['full', 'Full Packages'],
              ['ceramic', 'Ceramic Coatings'],
              ['memberships', 'Memberships'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key as any)}
                className={`rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all duration-300 ${
                  activeTab === key
                    ? 'bg-gold text-black shadow-[0_0_15px_rgba(212,175,55,0.3)]'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Promo Band */}
        {showPromosBand ? (
          <section className="mb-10">
            <p className="text-center text-[10px] font-bold uppercase tracking-[0.28em] text-gold-soft mb-3">Featured Active Offers</p>
            <div className="mx-auto flex max-w-4xl justify-center gap-4 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory">
              {displayDeals.websitePromoActive && displayDeals.websitePromoPercent > 0 ? (
                <article className="min-w-[300px] snap-start rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/8 via-zinc-950 to-black p-5 shadow-lg">
                  <p className="text-[9px] uppercase tracking-[0.2em] text-gold-soft font-black">{displayDeals.websitePromoLabel || 'Online Booking Promo'}</p>
                  <p className="mt-1 text-2xl font-black text-white">{displayDeals.websitePromoPercent}% Off Base Services</p>
                  <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                    Automatically applied to your base packages when booking online. {displayDeals.promoStacksWithMultiCar ? 'Combines with multi-car discount.' : 'Does not stack with multi-car discounts.'}
                  </p>
                </article>
              ) : null}
              <OffersMarketingBand embed offers={offers} placement="services" />
            </div>
          </section>
        ) : null}

        {/* Memberships Redirect Tab */}
        {activeTab === 'memberships' ? (
          <section className="rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/12 via-zinc-950 to-black p-8 shadow-[0_0_50px_rgba(212,175,55,0.12)] mb-12 text-center max-w-4xl mx-auto">
            <span className="inline-flex rounded-full bg-gold/15 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-gold border border-gold/35">
              Best Long-Term Value
            </span>
            <h2 className="mt-4 text-3.5xl font-black uppercase text-white tracking-tight">Gloss Boss Detailing Subscriptions</h2>
            <p className="mt-3 max-w-2xl mx-auto text-sm text-zinc-300 leading-relaxed">
              Maintain your vehicle's gloss year-round. Join our Bronze, Silver, or Gold membership plans to unlock bi-weekly washes, 2x loyalty stamp boosts, and up to 20% flat discount on add-on packages.
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <Link href="/memberships" className="rounded-xl bg-gold px-6 py-3.5 text-xs font-black uppercase tracking-wider text-black shadow-[0_0_20px_rgba(212,175,55,0.3)] hover:bg-gold-soft transition">
                Explore Memberships
              </Link>
              <Link href="/book" className="rounded-xl border border-white/15 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-white hover:bg-white/5 transition">
                Book One-Time Detail
              </Link>
            </div>
          </section>
        ) : null}

        {/* System Warnings Block */}
        {showSchemaNotice ? (
          <div role="alert" className="mb-6 rounded-2xl border border-amber-500/35 bg-amber-500/5 p-4 text-sm text-amber-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="h-4.5 w-4.5 text-gold-soft" /> Catalog Offline NOTICE</p>
                <p className="mt-1 text-xs text-zinc-400">Showing standard catalog packages. Discrepancies listed below:</p>
                <ul className="mt-2 list-disc pl-5 text-xs text-zinc-400 space-y-0.5">
                  {schemaWarnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => setDismissSchemaNotice(true)}
                className="shrink-0 rounded-lg border border-amber-500/30 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-200 hover:bg-amber-500/10"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {/* Main Service Cards Grid */}
        {loaded && activeTab !== 'memberships' && (
          <div className="space-y-8 mb-16">
            {serviceCards.map((service) => {
              const duration = getDuration(service);
              const isQuoteOnly = !service.sedanPrice || service.quoteRequired || service.comingSoon;
              const presentation = servicePresentation(service);

              return (
                <article
                  key={service.id}
                  className="group relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/40 backdrop-blur-md hover:-translate-y-1 hover:border-gold/30 hover:shadow-[0_0_44px_rgba(212,175,55,0.12)] transition-all duration-300"
                >
                  <div className="grid gap-0 lg:grid-cols-[0.9fr_1.35fr]">
                    <div className="relative min-h-[260px] overflow-hidden">
                      <Image
                        src={presentation.image}
                        alt={`${service.title} vehicle detail`}
                        fill
                        className="object-cover opacity-75 transition duration-700 group-hover:scale-105 group-hover:opacity-95"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
                      <div className="absolute bottom-5 left-5 right-5">
                        <span className="rounded-full border border-gold/30 bg-black/60 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-gold-soft backdrop-blur">
                          Member savings available
                        </span>
                        <p className="mt-3 text-sm leading-6 text-zinc-200">{presentation.ideal}</p>
                      </div>
                    </div>
                    <div className="p-6 sm:p-8">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 pb-6 border-b border-white/5">
                    <div>
                      <h2 className="text-2.5xl font-black uppercase text-white tracking-tight">{service.title}</h2>
                      {service.subtitle?.trim() && <p className="mt-1 text-xs text-zinc-400 italic">{service.subtitle}</p>}
                      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-zinc-900 border border-white/5 px-3 py-1 text-xs text-zinc-300">
                        <Clock className="h-3.5 w-3.5 text-gold-soft" />
                        <span>Estimated Duration: <strong className="text-white">{duration}</strong></span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!isQuoteOnly ? (
                        <>
                          <div className="rounded-2xl bg-zinc-900/80 border border-white/5 px-4 py-3 text-center min-w-[100px]">
                            <span className="block text-[9px] font-black uppercase text-zinc-500 tracking-wider">Sedan</span>
                            <span className="text-sm font-bold text-gold-soft">{formatVehiclePrice(service.sedanPrice)}</span>
                          </div>
                          <div className="rounded-2xl bg-zinc-900/80 border border-white/5 px-4 py-3 text-center min-w-[100px]">
                            <span className="block text-[9px] font-black uppercase text-zinc-500 tracking-wider">SUV</span>
                            <span className="text-sm font-bold text-gold-soft">{formatVehiclePrice(service.suvPrice ?? service.suvTruckPrice)}</span>
                          </div>
                          <div className="rounded-2xl bg-zinc-900/80 border border-white/5 px-4 py-3 text-center min-w-[100px]">
                            <span className="block text-[9px] font-black uppercase text-zinc-500 tracking-wider">Truck</span>
                            <span className="text-sm font-bold text-gold-soft">{formatVehiclePrice(service.truckPrice ?? service.suvTruckPrice)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-2xl bg-gold/10 border border-gold/30 px-6 py-3 text-center">
                          <span className="block text-[9px] font-black uppercase text-zinc-400 tracking-wider">Starting at</span>
                          <span className="text-sm font-black text-gold-soft">Quote Required</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Checklist of deliverables */}
                  <div className="mt-6">
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-3">Service Inclusions</p>
                    <ul className="grid gap-3 text-xs text-zinc-300 sm:grid-cols-2 md:grid-cols-3">
                      {service.includes.map((line) => (
                        <li key={line} className="flex items-start gap-2 bg-zinc-950/30 p-2.5 rounded-xl border border-white/5">
                          <Check className="h-4 w-4 shrink-0 text-gold-soft mt-0.5" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-6 rounded-2xl border border-white/10 bg-black/35 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold-soft">Popular upgrades</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {PUBLIC_ADDON_PRICING.slice(0, 4).map((addon) => (
                        <span key={`${service.id}-${addon.label}`} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-bold text-zinc-300">
                          {addon.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-8 flex flex-wrap justify-end gap-3">
                    {isQuoteOnly ? (
                      <Link
                        href="/contact"
                        className="rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase text-black hover:bg-gold-soft transition"
                      >
                        Request Custom Quote
                      </Link>
                    ) : (
                      <Link
                        href={`/book?service=${service.id}&package=${service.id}`}
                        className="rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase text-black shadow-[0_0_15px_rgba(212,175,55,0.2)] hover:bg-gold-soft transition"
                      >
                        Book this service
                      </Link>
                    )}
                  </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Multi-Car Bundle Feature */}
        <section className="mb-16 border border-white/10 bg-zinc-950/40 p-6 sm:p-8 rounded-3xl backdrop-blur-sm">
          <span className="inline-flex rounded-lg bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-400 border border-emerald-500/35 mb-3">
            Bundle & Save
          </span>
          <h3 className="text-2.5xl font-black uppercase tracking-tight text-white">Multi-Car Booking Discount</h3>
          {displayDeals.multiCarSecondVehicleDiscountPercent > 0 ? (
            <p className="mt-2 text-zinc-300 text-sm leading-relaxed max-w-3xl">
              Booking more than one vehicle? Automatically receive <strong className="text-gold-soft">{displayDeals.multiCarSecondVehicleDiscountPercent}% off</strong> the second vehicle base package during checkout. Perfect for families or detailing multiple cars on the same driveway visit.
            </p>
          ) : (
            <p className="mt-2 text-zinc-400 text-sm">Configure multi-car discounts under Deal settings in Admin.</p>
          )}
          {multiCarLine && (
            <div className="mt-4 p-3 bg-black/80 rounded-xl border border-white/5 font-mono text-xs text-zinc-400">
              {multiCarLine}
            </div>
          )}
        </section>

        {/* Placeholders for Future Offerings Expansion (Requested) */}
        <section className="mb-16">
          <div className="text-center mb-10">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-gold-soft">Coming Soon</p>
            <h3 className="mt-2 text-2.5xl font-black uppercase text-white tracking-tight">Future Services & Expansions</h3>
            <p className="mt-2 text-xs text-zinc-400">We are expanding our mobile garage to offer additional luxury services.</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/5 bg-zinc-950/20 p-5 opacity-75 hover:opacity-100 transition-opacity">
              <Compass className="h-6 w-6 text-zinc-500 mb-3" />
              <h4 className="text-sm font-black uppercase text-white">Pressure Washing</h4>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">Driveways, patios, solar panels, and residential exterior cleaning resetting.</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-zinc-950/20 p-5 opacity-75 hover:opacity-100 transition-opacity">
              <Sparkles className="h-6 w-6 text-zinc-500 mb-3" />
              <h4 className="text-sm font-black uppercase text-white">Headlight Restoration</h4>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">Oxidation removal, multi-stage sanding, clear coat sealing for night safety.</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-zinc-950/20 p-5 opacity-75 hover:opacity-100 transition-opacity">
              <Zap className="h-6 w-6 text-zinc-500 mb-3" />
              <h4 className="text-sm font-black uppercase text-white">Engine Bay Cleaning</h4>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">Degreasing, steam blowouts, plastic detailing protection for engine compartments.</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-zinc-950/20 p-5 opacity-75 hover:opacity-100 transition-opacity">
              <ShieldCheck className="h-6 w-6 text-zinc-500 mb-3" />
              <h4 className="text-sm font-black uppercase text-white">Fleet Packages</h4>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">Commercial, corporate parking lot, and dealership recurring packages.</p>
            </div>
          </div>
        </section>

        {/* Fleet Services Section */}
        {fleetEnabled && (
          <section className="mb-16 border border-gold/20 bg-gradient-to-br from-gold/10 via-zinc-950 to-black p-6 sm:p-8 rounded-3xl shadow-[0_0_40px_rgba(212,175,55,0.08)]">
            <p className="text-xs uppercase tracking-[0.25em] text-gold-soft font-black">Corporate & Business accounts</p>
            <h2 className="mt-2 text-2.5xl font-black uppercase text-white tracking-tight">Commercial Fleet Detailing</h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">{fleetBlurb}</p>
            
            <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              <div className="rounded-xl border border-white/5 bg-black/60 p-4">
                <span className="block text-[9px] font-black uppercase text-zinc-500">Tier 1</span>
                <span className="font-bold text-gold-soft block mt-1">{fleetPricing?.smallLabel ?? "Small (1–5 Cars)"}</span>
                <span className="text-xs text-zinc-400">{fleetPricing?.smallDetail ?? "Starting at $65/car"}</span>
              </div>
              <div className="rounded-xl border border-white/5 bg-black/60 p-4">
                <span className="block text-[9px] font-black uppercase text-zinc-500">Tier 2</span>
                <span className="font-bold text-gold-soft block mt-1">{fleetPricing?.mediumLabel ?? "Medium (6–15 Cars)"}</span>
                <span className="text-xs text-zinc-400">{fleetPricing?.mediumDetail ?? "Starting at $55/car"}</span>
              </div>
              <div className="rounded-xl border border-white/5 bg-black/60 p-4">
                <span className="block text-[9px] font-black uppercase text-zinc-500">Tier 3</span>
                <span className="font-bold text-gold-soft block mt-1">{fleetPricing?.largeLabel ?? "Large (15+ Cars)"}</span>
                <span className="text-xs text-zinc-400">{fleetPricing?.largeDetail ?? "Custom quote"}</span>
              </div>
              <div className="rounded-xl border border-white/5 bg-black/60 p-4">
                <span className="block text-[9px] font-black uppercase text-zinc-500">Frequency Boost</span>
                <span className="font-bold text-gold-soft block mt-1">Discounts</span>
                <span className="text-xs text-zinc-400">Weekly ({fleetPricing?.weeklyDiscount ?? "5%"}) · Bi-weekly ({fleetPricing?.biweeklyDiscount ?? "3%"}) · Monthly ({fleetPricing?.monthlyDiscount ?? "10%"})</span>
              </div>
            </div>
            {fleetPricing?.commercialNotes && (
              <p className="mt-4 text-xs text-zinc-500 italic">Note: {fleetPricing.commercialNotes}</p>
            )}

            <div className="mt-8 border-t border-white/5 pt-8">
              <FleetInquiryForm />
            </div>
          </section>
        )}

        {/* Add-ons & Upgrades List */}
        <section className="mb-16 rounded-3xl border border-white/10 bg-zinc-950/30 p-6 sm:p-8">
          <h3 className="text-xl font-black uppercase tracking-tight text-white mb-2">Available Individual Add-ons</h3>
          <p className="text-xs text-zinc-400 mb-6">Customize your detailing package. Add-ons can be selected during the booking checkout flow.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {PUBLIC_ADDON_PRICING.map((addon) => (
              <div key={addon.label} className="rounded-2xl border border-white/5 bg-black/40 p-4 hover:border-gold/15 transition-all">
                <p className="text-xs font-black uppercase text-white tracking-wide">{addon.label}</p>
                <p className="mt-1 text-xs text-zinc-400">{addon.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Sticky footer CTAs */}
        <div className="flex flex-wrap items-center justify-between gap-6 border-t border-white/10 pt-10">
          <div>
            <h4 className="text-lg font-black uppercase text-white">Ready for a showroom reset?</h4>
            <p className="text-xs text-zinc-400">Secure your appointment slot in minutes.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/book" className="rounded-xl bg-gold px-6 py-3.5 text-xs font-black uppercase tracking-widest text-black shadow-[0_0_20px_rgba(212,175,55,0.25)] hover:bg-gold-soft transition">
              Book Appointment
            </Link>
            <Link href="/gift-cards" className="rounded-xl border border-white/20 bg-black/50 px-6 py-3.5 text-xs font-black uppercase tracking-widest text-white hover:border-gold/25 transition">
              Purchase Gift Card
            </Link>
          </div>
        </div>

        {/* Legal disclosures */}
        <div className="mt-12 text-center text-[10px] text-zinc-600 space-y-2 max-w-4xl mx-auto">
          <p>{PRICING_DISCLAIMER}</p>
          <p>{PRICING_DISCOUNT_RULES}</p>
        </div>
      </div>
    </main>
  );
}
