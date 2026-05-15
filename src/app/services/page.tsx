"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { defaultDealConfig, defaultServicePackages, formatVehiclePrice, type DealConfig, type ServicePackage } from "@/lib/site-config";
import { defaultMarketingOffers, type PublicSiteDataPayload, type SiteDataMultiCar, type SiteDataOfferCard } from "@/lib/public-site-data";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const emptyDeals: DealConfig = {
  websitePromoPercent: 0,
  websitePromoLabel: "",
  websitePromoActive: false,
  multiCarSecondVehicleDiscountPercent: 0,
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

  const packages = services.length > 0 ? services : defaultServicePackages;
  const displayDeals = loaded ? deals : defaultDealConfig;
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

  const activeOfferCards = useMemo(() => {
    const src = offers.length > 0 ? offers : loaded ? defaultMarketingOffers() : [];
    return [...src].filter((o) => o.active).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [offers, loaded]);

  const showPromosBand =
    (displayDeals.websitePromoActive && displayDeals.websitePromoPercent > 0) ||
    activeOfferCards.length > 0 ||
    !loaded;

  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-24 text-foreground sm:px-6">
      <div className="mx-auto w-full max-w-6xl">
        <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Mobile Detailing - We Come To You</p>
        <h1 className="mt-3 text-4xl font-black uppercase sm:text-5xl">Services & Pricing</h1>
        <p className="mt-3 max-w-3xl text-zinc-300">
          Transparent package pricing with clear deliverables so customers know exactly what they are buying.
        </p>

        {showPromosBand ? (
          <section className="mt-8">
            <p className="text-xs uppercase tracking-[0.22em] text-gold-soft">Featured offers</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {displayDeals.websitePromoActive && displayDeals.websitePromoPercent > 0 ? (
                <article className="min-h-[160px] rounded-2xl border-2 border-amber-400/45 bg-gradient-to-br from-amber-500/20 via-black/50 to-black/80 p-6 shadow-[0_0_28px_rgba(251,191,36,0.14)] ring-1 ring-amber-300/25">
                  <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">{displayDeals.websitePromoLabel || "Website booking offer"}</p>
                  <p className="mt-2 text-2xl font-black text-white sm:text-3xl">{displayDeals.websitePromoPercent}% OFF Website Bookings</p>
                  <p className="mt-2 text-sm text-zinc-300">Cannot be stacked with multi-car discount — best savings applies automatically at checkout.</p>
                </article>
              ) : null}
              {activeOfferCards.map((o) => (
                <article
                  key={o.id}
                  className="flex min-h-[160px] flex-col justify-between rounded-2xl border border-gold/30 bg-zinc-950/90 p-6 shadow-[0_0_22px_rgba(212,166,77,0.12)]"
                >
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Promotion</p>
                    <h2 className="mt-2 text-xl font-black uppercase text-white">{o.title}</h2>
                    {o.description ? <p className="mt-2 text-sm text-zinc-400">{o.description}</p> : null}
                  </div>
                  {o.discountPercent > 0 ? (
                    <p className="mt-4 text-3xl font-black text-gold-soft">{o.discountPercent}% off</p>
                  ) : null}
                </article>
              ))}
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

        <section className="mt-6 rounded-2xl border border-gold/30 bg-black/40 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Two Car Deal</p>
          <h3 className="mt-2 text-3xl font-black uppercase">Multi-Car Bundle</h3>
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
          {multiCarLine ? <p className="mt-2 text-sm text-zinc-400">{multiCarLine}</p> : loaded ? <p className="mt-2 text-sm text-zinc-400">Publish catalog pricing to show a live example.</p> : null}
        </section>

        {!loaded ? <p className="mt-4 text-xs text-zinc-500">Loading latest packages…</p> : null}

        {showCatalogFallbackNote ? (
          <p className="mt-3 rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
            Live catalog returned no rows — showing standard packages until services are published in Admin.
          </p>
        ) : null}

        <div className="mt-6 space-y-4">
          {packages.map((service) => (
                <article
                  key={service.id}
                  className="rounded-2xl border border-gold/20 bg-zinc-950 p-5 shadow-[0_0_0_rgba(212,166,77,0)] transition duration-300 hover:-translate-y-1 hover:border-gold/45 hover:shadow-[0_0_32px_rgba(212,166,77,0.18)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <h2 className="text-2xl font-black uppercase text-gold-soft">{service.title}</h2>
                    <div className="flex flex-wrap gap-2 text-sm font-bold">
                      <span className="rounded-lg border border-gold/30 px-3 py-2">Sedan {formatVehiclePrice(service.sedanPrice)}</span>
                      <span className="rounded-lg border border-gold/30 px-3 py-2">SUV / Truck {formatVehiclePrice(service.suvTruckPrice)}</span>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-zinc-300">{service.subtitle}</p>
                  <ul className="mt-4 grid gap-2 text-sm text-zinc-200 sm:grid-cols-2">
                    {service.includes.map((line) => (
                      <li key={line}>✦ {line}</li>
                    ))}
                  </ul>
                </article>
              ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/book" className="rounded-lg bg-gold px-5 py-3 text-sm font-bold uppercase tracking-wider text-black">
            Book Service
          </Link>
          <Link href="/gift-cards" className="rounded-lg border border-white/20 px-5 py-3 text-sm font-bold uppercase tracking-wider text-white">
            Buy Gift Card
          </Link>
        </div>
      </div>
    </main>
  );
}
