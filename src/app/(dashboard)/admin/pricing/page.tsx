"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { defaultDealConfig, defaultServicePackages, type DealConfig, type ServicePackage } from "@/lib/site-config";
import { loadDealConfig, loadServicePackages, saveDealConfig, saveServicePackages } from "@/lib/pricing-storage";

export default function AdminPricingPage() {
  const [services, setServices] = useState<ServicePackage[]>(defaultServicePackages);
  const [deals, setDeals] = useState<DealConfig>(defaultDealConfig);

  useEffect(() => {
    setServices(loadServicePackages());
    setDeals(loadDealConfig());
  }, []);

  const updateService = (
    index: number,
    key: "sedanPrice" | "suvTruckPrice",
    value: string
  ) => {
    setServices((current) =>
      current.map((service, idx) => {
        if (idx !== index) return service;
        const numeric = value.trim() === "" ? null : Number(value);
        return { ...service, [key]: Number.isNaN(numeric) ? null : numeric };
      })
    );
  };

  const saveAll = () => {
    saveServicePackages(services);
    saveDealConfig(deals);
    window.alert("Pricing and deals updated. Refresh homepage/booking to see changes.");
  };

  return (
    <main className="min-h-screen bg-background px-4 py-24 text-foreground sm:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="rounded-2xl border border-gold/20 bg-zinc-950 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Admin</p>
          <h1 className="mt-2 text-3xl font-black uppercase">Pricing & Deals Controls</h1>
          <p className="mt-2 text-sm text-zinc-300">These values drive homepage cards, services page, and booking package pricing.</p>
        </header>

        <section className="rounded-2xl border border-gold/20 bg-zinc-950 p-5">
          <h2 className="text-lg font-bold uppercase">Service Pricing</h2>
          <div className="mt-4 space-y-3">
            {services.map((service, idx) => (
              <article key={service.id} className="grid gap-3 rounded-xl border border-white/10 bg-black/30 p-4 md:grid-cols-[1fr_160px_160px] md:items-center">
                <div>
                  <p className="font-semibold text-gold-soft">{service.title}</p>
                  <p className="text-xs text-zinc-400">{service.subtitle}</p>
                </div>
                <label className="text-xs text-zinc-300">
                  Sedan price
                  <input
                    type="number"
                    value={service.sedanPrice ?? ""}
                    onChange={(e) => updateService(idx, "sedanPrice", e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-black px-3 py-2"
                  />
                </label>
                <label className="text-xs text-zinc-300">
                  SUV/Truck price
                  <input
                    type="number"
                    value={service.suvTruckPrice ?? ""}
                    onChange={(e) => updateService(idx, "suvTruckPrice", e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-black px-3 py-2"
                  />
                </label>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gold/20 bg-zinc-950 p-5">
          <h2 className="text-lg font-bold uppercase">Deals</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-xs text-zinc-300">
              Website promo label
              <input
                type="text"
                value={deals.websitePromoLabel}
                onChange={(e) => setDeals((current) => ({ ...current, websitePromoLabel: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-black px-3 py-2"
              />
            </label>
            <label className="text-xs text-zinc-300">
              Website promo %
              <input
                type="number"
                value={deals.websitePromoPercent}
                onChange={(e) =>
                  setDeals((current) => ({ ...current, websitePromoPercent: Number(e.target.value || 0) }))
                }
                className="mt-1 w-full rounded-md border border-zinc-700 bg-black px-3 py-2"
              />
            </label>
            <label className="text-xs text-zinc-300">
              Multi-car second vehicle %
              <input
                type="number"
                value={deals.multiCarSecondVehicleDiscountPercent}
                onChange={(e) =>
                  setDeals((current) => ({
                    ...current,
                    multiCarSecondVehicleDiscountPercent: Number(e.target.value || 0),
                  }))
                }
                className="mt-1 w-full rounded-md border border-zinc-700 bg-black px-3 py-2"
              />
            </label>
            <label className="mt-6 flex items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={deals.websitePromoActive}
                onChange={(e) => setDeals((current) => ({ ...current, websitePromoActive: e.target.checked }))}
              />
              Website promo active
            </label>
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <button onClick={saveAll} className="rounded-lg bg-gold px-5 py-3 text-sm font-bold uppercase tracking-wider text-black">
            Save Changes
          </button>
          <Link href="/services" className="rounded-lg border border-white/20 px-5 py-3 text-sm font-bold uppercase tracking-wider text-white">
            View Services Page
          </Link>
          <Link href="/admin" className="rounded-lg border border-gold/30 px-5 py-3 text-sm font-bold uppercase tracking-wider text-gold-soft">
            Back To Admin
          </Link>
        </div>
      </div>
    </main>
  );
}
