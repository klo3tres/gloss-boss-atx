"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  const [activeTab, setActiveTab] = useState<'exterior' | 'interior' | 'full' | 'ceramic' | 'memberships'>('exterior');

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
    if (activeTab === 'memberships') return false;
    if (activeTab === 'full') return text.includes('full') || text.includes('detail');
    return text.includes(activeTab);
  });
  const serviceCards = visiblePackages.length > 0 ? visiblePackages : packages;

  return (
    <main className="gb-luxury-page min-h-screen bg-background px-4 pb-16 pt-24 text-foreground sm:px-6">
      <div className="mx-auto w-full max-w-6xl">
        <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Mobile Detailing - We Come To You</p>
        <h1 className="mt-3 text-4xl font-black uppercase sm:text-5xl">Services & Pricing</h1>
        <p className="mt-3 max-w-3xl text-zinc-300">
          Transparent package pricing with clear deliverables so customers know exactly what they are buying. All prices are starting at.
        </p>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-500">{PRICING_DISCLAIMER}</p>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-500">{PRICING_DISCOUNT_RULES}</p>

        {showPromosBand ? (
          <section className='mt-6'>
            <p className='text-[10px] font-bold uppercase tracking-[0.28em] text-gold-soft'>Featured offers</p>
            <div className='mt-3 flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory'>
              {displayDeals.websitePromoActive && displayDeals.websitePromoPercent > 0 ? (
                <article className='min-w-[min(100%,280px)] snap-start rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-500/14 via-black/65 to-black/90 p-4 shadow-[0_0_28px_rgba(251,191,36,0.18)] ring-1 ring-amber-300/25 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_36px_rgba(251,191,36,0.26)]'>
                  <p className='text-[10px] uppercase tracking-[0.2em] text-gold-soft'>{displayDeals.websitePromoLabel || 'Website booking offer'}</p>
                  <p className='mt-1.5 text-xl font-black text-white sm:text-2xl'>{displayDeals.websitePromoPercent}% off online bookings</p>
                  <p className='mt-2 text-xs leading-relaxed text-zinc-300'>
                    {displayDeals.promoStacksWithMultiCar
                      ? 'Stacks with multi-car savings when both are enabled in admin.'
                      : 'Does not stack with multi-car — checkout applies the best single discount.'}
                  </p>
                </article>
              ) : null}
              <OffersMarketingBand embed offers={offers} placement='services' />
            </div>
          </section>
        ) : null}

        <div className='mt-6 flex gap-2 overflow-x-auto pb-2'>
          {[
            ['exterior', 'Exterior'],
            ['interior', 'Interior'],
            ['full', 'Full Detail'],
            ['ceramic', 'Ceramic Coating'],
            ['memberships', 'Memberships'],
          ].map(([key, label]) => (
            <button
              key={key}
              type='button'
              onClick={() => setActiveTab(key as typeof activeTab)}
              className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wider transition ${activeTab === key ? 'border-gold bg-gold text-black' : 'border-white/15 bg-black/35 text-zinc-300 hover:border-gold/40'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'memberships' ? (
          <section className='mt-6 rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/15 via-zinc-950 to-black p-6 shadow-[0_0_40px_rgba(212,175,55,0.12)]'>
            <p className='text-xs font-black uppercase tracking-[0.24em] text-gold-soft'>Memberships</p>
            <h2 className='mt-2 text-3xl font-black uppercase text-white'>Save with Gloss Boss Memberships</h2>
            <p className='mt-3 max-w-2xl text-sm text-zinc-300'>Choose Bronze, Silver, Gold, or Elite plans when enabled. Members get configured discounts, included services, and loyalty stamps toward rewards.</p>
            <div className='mt-5 flex flex-wrap gap-3'>
              <Link href='/memberships' className='rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase text-black'>View memberships</Link>
              <Link href='/book' className='rounded-xl border border-white/15 px-5 py-3 text-xs font-black uppercase text-white'>Book one-time detail</Link>
            </div>
          </section>
        ) : null}

        {showSchemaNotice ? (
          <div role="alert" className="mt-4 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-left text-sm text-amber-100">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Site notice</p>
                <p className="mt-1 text-xs text-amber-100/90">We are using safe defaults where needed. Dismiss anytime.</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs break-words text-amber-100/95">
                  {schemaWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => setDismissSchemaNotice(true)}
                className="shrink-0 rounded border border-amber-400/50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-50 hover:bg-amber-500/20"
                aria-label="Dismiss configuration notice"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        <section className="mt-6 gb-premium-card rounded-2xl border border-gold/20 p-6 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-soft font-black">Two Car Deal</p>
          <h3 className="mt-2 text-3xl font-black uppercase tracking-tight text-white">Multi-Car Bundle</h3>
          {displayDeals.multiCarSecondVehicleDiscountPercent > 0 ? (
            <p className="mt-2 text-zinc-200">
              Get <span className="font-bold text-gold-soft">{displayDeals.multiCarSecondVehicleDiscountPercent}% off</span> the second vehicle when both are booked in one appointment.
            </p>
          ) : loaded ? (
            <p className="mt-2 text-sm text-zinc-400">Multi-car discount is managed in Admin → deal settings.</p>
          ) : (
            <p className="mt-2 text-zinc-200">
              Get <span className="font-bold text-gold-soft">{displayDeals.multiCarSecondVehicleDiscountPercent}% off</span> the second vehicle when both are booked in one appointment.
            </p>
          )}
          {multiCarLine ? <p className="mt-2 text-sm text-zinc-400 font-mono bg-black/40 p-2 rounded-lg border border-white/5">{multiCarLine}</p> : loaded ? <p className="mt-2 text-sm text-zinc-400">Publish catalog pricing to show a live example.</p> : null}
        </section>

        {!loaded ? (
          <div className="mt-6 space-y-4" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-2xl border border-white/10 bg-zinc-900/80" />
            ))}
          </div>
        ) : null}

        {showCatalogFallbackNote ? (
          <p className="mt-3 rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
            Live catalog returned no rows — showing standard packages until services are published in Admin.
          </p>
        ) : null}

        {loaded && activeTab !== 'memberships' ? (
        <div className="mt-6 space-y-6">
          {serviceCards.map((service) => (
                <article
                  key={service.id}
                  className="gb-premium-card rounded-2xl border border-gold/15 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-gold/45 hover:shadow-[0_0_35px_rgba(212,175,55,0.18)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
                    <h2 className="text-2xl font-black uppercase tracking-tight text-white">{service.title}</h2>
                    <div className="flex flex-wrap gap-2 text-sm font-bold">
                      <span className="rounded-full bg-gold/10 text-gold-soft border border-gold/30 px-3 py-1.5 text-xs font-black uppercase tracking-wider">Sedan {formatVehiclePrice(service.sedanPrice)}</span>
                      <span className="rounded-full bg-gold/10 text-gold-soft border border-gold/30 px-3 py-1.5 text-xs font-black uppercase tracking-wider">SUV {formatVehiclePrice(service.suvPrice ?? service.suvTruckPrice)}</span>
                      <span className="rounded-full bg-gold/10 text-gold-soft border border-gold/30 px-3 py-1.5 text-xs font-black uppercase tracking-wider">Truck {formatVehiclePrice(service.truckPrice ?? service.suvTruckPrice)}</span>
                    </div>
                  </div>
                  {service.subtitle?.trim() ? <p className="mt-4 text-sm text-zinc-300 italic">{service.subtitle}</p> : null}
                  <ul className="mt-4 grid gap-3 text-sm text-zinc-200 sm:grid-cols-2">
                    {service.includes.map((line) => (
                      <li key={line} className="flex items-start gap-2">
                        <span className="text-gold shrink-0">✦</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
        </div>
        ) : null}

        {fleetEnabled ? (
          <section className="mt-10 gb-premium-card rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 via-zinc-950 to-black p-6 shadow-[0_0_40px_rgba(212,175,55,0.1)]">
            <p className="text-xs uppercase tracking-[0.25em] text-gold-soft font-black">Fleet & business accounts</p>
            <h2 className="mt-2 text-2xl font-black uppercase text-white sm:text-3xl tracking-tight">Fleet & Business Detailing</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300">{fleetBlurb}</p>
            <ul className="mt-4 grid gap-3 text-sm text-zinc-200 sm:grid-cols-2">
              <li className="rounded-xl border border-white/5 bg-black/60 px-4 py-3">
                <span className="font-bold text-gold-soft">{fleetPricing?.smallLabel ?? "Small fleet (1–5 vehicles)"}</span>
                <span className="block mt-1 text-xs text-zinc-400">{fleetPricing?.smallDetail ?? "from $65/vehicle exterior wash"}</span>
              </li>
              <li className="rounded-xl border border-white/5 bg-black/60 px-4 py-3">
                <span className="font-bold text-gold-soft">{fleetPricing?.mediumLabel ?? "Medium fleet (6–15 vehicles)"}</span>
                <span className="block mt-1 text-xs text-zinc-400">{fleetPricing?.mediumDetail ?? "from $55/vehicle exterior wash"}</span>
              </li>
              <li className="rounded-xl border border-white/5 bg-black/60 px-4 py-3">
                <span className="font-bold text-gold-soft">{fleetPricing?.largeLabel ?? "Large fleet (15+ vehicles)"}</span>
                <span className="block mt-1 text-xs text-zinc-400">{fleetPricing?.largeDetail ?? "custom quote"}</span>
              </li>
              <li className="rounded-xl border border-white/5 bg-black/60 px-4 py-3">
                <span className="font-bold text-gold-soft">Recurring Frequencies</span>
                <span className="block mt-1 text-xs text-zinc-400">Weekly ({fleetPricing?.weeklyDiscount ?? "5%"}) · Biweekly ({fleetPricing?.biweeklyDiscount ?? "3%"}) · Monthly ({fleetPricing?.monthlyDiscount ?? "10%"})</span>
              </li>
            </ul>
            <p className="mt-3 text-xs text-zinc-500 italic">{fleetPricing?.commercialNotes ?? "Recurring fleet maintenance, employee parking lots, water/power access — we document everything on site."}</p>
            <FleetInquiryForm />
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/contact" className="rounded-lg border border-white/20 px-5 py-3 text-sm font-bold uppercase tracking-wider text-white hover:bg-white/5 transition duration-200">
                General contact
              </Link>
              <a href="tel:+15124812319" className="rounded-lg border border-white/20 px-5 py-3 text-sm font-bold uppercase tracking-wider text-white hover:bg-white/5 transition duration-200">
                Call (512) 481-2319
              </a>
            </div>
          </section>
        ) : null}

        <section className="mt-10 gb-premium-card rounded-2xl border border-gold/20 p-6">
          <h2 className="text-xl font-black uppercase tracking-tight text-white">Add-ons & Upgrades</h2>
          <p className="mt-2 text-sm text-zinc-400">Optional upgrades — final price depends on vehicle and condition.</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {PUBLIC_ADDON_PRICING.map((addon) => (
              <li key={addon.label} className="rounded-xl border border-white/5 bg-black/40 px-4 py-3">
                <p className="font-bold text-gold-soft">{addon.label}</p>
                <p className="mt-1 text-sm text-zinc-300">{addon.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/book" className="rounded-xl bg-gradient-to-r from-gold via-gold-soft to-gold px-8 py-4 text-sm font-black uppercase tracking-widest text-black shadow-[0_0_35px_rgba(212,175,55,0.3)] hover:brightness-110 transition duration-300">
            Book Service
          </Link>
          <Link href="/gift-cards" className="rounded-xl border border-white/20 bg-black/40 px-8 py-4 text-sm font-black uppercase tracking-widest text-white hover:border-gold/40 hover:text-gold-soft transition duration-300">
            Buy Gift Card
          </Link>
        </div>
      </div>
    </main>
  );
}
