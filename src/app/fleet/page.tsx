import Link from 'next/link';
import Image from 'next/image';
import { Building2, CalendarCheck, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { FleetInquiryForm } from '@/components/public/fleet-inquiry-form';
import { DEFAULT_FLEET_PRICING, parseFleetPricing } from '@/lib/fleet-pricing';
import { mediaUrl, normalizeMediaRegistry } from '@/lib/media-registry';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function FleetPage() {
  const admin = tryCreateAdminSupabase();
  let blurb = 'Recurring mobile detailing for business fleets, dealerships, executive teams, and property-managed vehicle groups.';
  let pricing = { ...DEFAULT_FLEET_PRICING };
  let registry = {};
  if (admin) {
    const { data } = await admin
      .from('site_settings')
      .select('key, value')
      .in('key', ['fleet_services_blurb', 'fleet_pricing', 'media_registry'])
      .limit(10);
    const rows = (data ?? []) as Record<string, unknown>[];
    blurb = String(rows.find((r) => r.key === 'fleet_services_blurb')?.value ?? blurb);
    const raw = rows.find((r) => r.key === 'fleet_pricing')?.value;
    try {
      pricing = parseFleetPricing(typeof raw === 'string' ? JSON.parse(raw) : raw);
    } catch {
      pricing = { ...DEFAULT_FLEET_PRICING };
    }
    registry = normalizeMediaRegistry(rows.find((r) => r.key === 'media_registry')?.value ?? null);
  }

  const tiers = [
    { label: pricing.smallLabel, detail: pricing.smallDetail },
    { label: pricing.mediumLabel, detail: pricing.mediumDetail },
    { label: pricing.largeLabel, detail: pricing.largeDetail },
  ];

  return (
    <main className='gb-luxury-page min-h-screen bg-black text-white'>
      <section className='relative overflow-hidden border-b border-gold/20'>
        <Image
          src={mediaUrl(registry, 'fleet.hero')}
          alt="Gloss Boss ATX fleet detailing"
          fill
          priority
          unoptimized={mediaUrl(registry, 'fleet.hero').startsWith('http')}
          className="object-cover opacity-35"
        />
        <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,rgba(0,0,0,0.96),rgba(0,0,0,0.62),rgba(0,0,0,0.94))]' />
        <div className='relative mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:px-8'>
          <div>
            <p className='text-xs font-black uppercase tracking-[0.3em] text-gold-soft'>Gloss Boss ATX Fleet Care</p>
            <h1 className='mt-4 text-4xl font-black uppercase leading-none sm:text-6xl'>Premium mobile detailing for business fleets</h1>
            <p className='mt-5 max-w-2xl text-base leading-7 text-zinc-300'>{blurb}</p>
            <div className="mt-7 grid max-w-2xl gap-3 sm:grid-cols-3">
              {['Work trucks', 'Company vehicles', 'Executive fleets'].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
                  <p className="text-sm font-black text-white">{item}</p>
                  <p className="mt-1 text-xs text-zinc-400">Recurring on-site care</p>
                </div>
              ))}
            </div>
            <div className='mt-8 flex flex-wrap gap-3'>
              <a href='#fleet-inquiry' className='rounded-xl bg-gold px-6 py-3 text-sm font-black uppercase text-black shadow-[0_0_24px_rgba(212,166,77,0.25)] transition hover:bg-gold-soft'>Request fleet quote</a>
              <Link href='/book' className='rounded-xl border border-white/15 bg-black/35 px-6 py-3 text-sm font-black uppercase text-white transition hover:border-gold/35'>Book one vehicle</Link>
            </div>
          </div>
          <div className='rounded-3xl border border-gold/20 bg-zinc-950/80 p-6 shadow-[0_0_42px_rgba(212,166,77,0.14)]'>
            <Building2 className='h-9 w-9 text-gold-soft' />
            <h2 className='mt-4 text-2xl font-black uppercase'>Designed for operators</h2>
            <div className='mt-5 grid gap-3'>
              {[
                ['Scheduled routes', 'Weekly, bi-weekly, monthly, or custom recurring service windows.'],
                ['Documented work', 'Photos, notes, and service records stay tied to each vehicle.'],
                ['On-site efficiency', 'We come to offices, lots, warehouses, and managed properties.'],
              ].map(([title, copy]) => (
                <div key={title} className='rounded-2xl border border-white/10 bg-black/45 p-4'>
                  <p className='font-black text-white'>{title}</p>
                  <p className='mt-1 text-sm text-zinc-400'>{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className='mx-auto max-w-7xl px-5 py-14 lg:px-8'>
        <div className="mb-8 grid gap-4 md:grid-cols-4">
          {[
            ['Maintenance plans', 'Exterior refreshes, interior resets, and cadence-based care.'],
            ['Multi-vehicle discounts', 'Simple tiers for small, mid-size, and large fleets.'],
            ['On-site service', 'Office lots, warehouses, dealerships, and managed properties.'],
            ['Recurring schedules', 'Weekly, bi-weekly, monthly, or custom routes.'],
          ].map(([title, copy]) => (
            <div key={title} className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5 transition hover:-translate-y-1 hover:border-gold/30">
              <p className="text-sm font-black uppercase text-white">{title}</p>
              <p className="mt-2 text-xs leading-5 text-zinc-400">{copy}</p>
            </div>
          ))}
        </div>
        <div className='grid gap-4 md:grid-cols-3'>
          {tiers.map((tier) => (
            <div key={tier.label} className='rounded-3xl border border-gold/20 bg-zinc-950 p-6 transition hover:-translate-y-1 hover:border-gold/45'>
              <Truck className='h-7 w-7 text-gold-soft' />
              <p className='mt-4 text-xl font-black text-white'>{tier.label}</p>
              <p className='mt-2 text-sm text-zinc-400'>{tier.detail}</p>
            </div>
          ))}
        </div>
        <div className='mt-5 grid gap-4 md:grid-cols-3'>
          {[
            ['Recurring savings', `Weekly ${pricing.weeklyDiscount} · bi-weekly ${pricing.biweeklyDiscount} · monthly ${pricing.monthlyDiscount}`],
            ['Insured mobile service', 'Premium products, on-site documentation, and careful access notes.'],
            ['Fast quote flow', 'Tell us fleet size, locations, and service cadence. We follow up with a usable plan.'],
          ].map(([title, copy], i) => {
            const Icon = i === 0 ? Sparkles : i === 1 ? ShieldCheck : CalendarCheck;
            return (
              <div key={title} className='rounded-2xl border border-white/10 bg-black/35 p-5'>
                <Icon className='h-5 w-5 text-gold-soft' />
                <p className='mt-3 font-black text-white'>{title}</p>
                <p className='mt-1 text-sm text-zinc-400'>{copy}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-8 rounded-3xl border border-gold/20 bg-gradient-to-br from-gold/10 via-zinc-950 to-black p-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-gold-soft">Example operating plan</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[
              ['5 vehicles', pricing.smallDetail],
              ['12 vehicles', pricing.mediumDetail],
              ['15+ vehicles', pricing.largeDetail],
            ].map(([label, detail]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-black/45 p-4">
                <p className="text-lg font-black text-white">{label}</p>
                <p className="mt-1 text-sm text-zinc-400">{detail}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-black/40 p-5 lg:col-span-2">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-gold-soft">Fleet success stories</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ['Property management', 'Cleaner resident-facing lots and fewer vendor visits.'],
                ['Dealerships', 'Inventory stays photo-ready before weekend traffic.'],
                ['Medical offices', 'Executive and staff vehicles handled on-site between shifts.'],
                ['Construction companies', 'Work trucks cleaned on cadence without leaving the job rhythm.'],
              ].map(([title, copy]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
                  <p className="font-black text-white">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{copy}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-gold/20 bg-black/40 p-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-gold-soft">Cost savings example</p>
            <p className="mt-4 text-3xl font-black text-white">One vendor. One route. One invoice.</p>
            <p className="mt-3 text-sm leading-6 text-zinc-400">Volume discounts reduce per-vehicle spend as fleet size and service frequency increase.</p>
          </div>
        </div>
        <div className="mt-8 rounded-3xl border border-white/10 bg-zinc-950/70 p-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-gold-soft">Commercial testimonials</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[
              ['Executive assistant', 'The team shows up prepared and keeps our vehicles client-ready.'],
              ['Fleet manager', 'Recurring service made vehicle care predictable instead of reactive.'],
              ['Dealership operator', 'The photo documentation and scheduling discipline are what sold us.'],
            ].map(([role, quote]) => (
              <blockquote key={role} className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <p className="text-sm leading-6 text-zinc-300">"{quote}"</p>
                <footer className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-gold-soft">{role}</footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      <section id='fleet-inquiry' className='mx-auto max-w-4xl px-5 pb-20 lg:px-8'>
        <div className='rounded-3xl border border-gold/20 bg-zinc-950 p-6 shadow-[0_0_42px_rgba(212,166,77,0.10)]'>
          <p className='text-xs font-black uppercase tracking-[0.24em] text-gold-soft'>Fleet quote request</p>
          <h2 className='mt-3 text-3xl font-black uppercase text-white'>Build a recurring care plan</h2>
          <p className='mt-2 text-sm text-zinc-400'>{pricing.commercialNotes}</p>
          <FleetInquiryForm />
        </div>
      </section>
    </main>
  );
}
