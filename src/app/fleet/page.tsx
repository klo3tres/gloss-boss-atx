import Link from 'next/link';
import { Building2, CalendarCheck, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { FleetInquiryForm } from '@/components/public/fleet-inquiry-form';
import { DEFAULT_FLEET_PRICING, parseFleetPricing } from '@/lib/fleet-pricing';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function FleetPage() {
  const admin = tryCreateAdminSupabase();
  let blurb = 'Recurring mobile detailing for business fleets, dealerships, executive teams, and property-managed vehicle groups.';
  let pricing = { ...DEFAULT_FLEET_PRICING };
  if (admin) {
    const { data } = await admin
      .from('site_settings')
      .select('key, value')
      .in('key', ['fleet_services_blurb', 'fleet_pricing'])
      .limit(10);
    const rows = (data ?? []) as Record<string, unknown>[];
    blurb = String(rows.find((r) => r.key === 'fleet_services_blurb')?.value ?? blurb);
    const raw = rows.find((r) => r.key === 'fleet_pricing')?.value;
    try {
      pricing = parseFleetPricing(typeof raw === 'string' ? JSON.parse(raw) : raw);
    } catch {
      pricing = { ...DEFAULT_FLEET_PRICING };
    }
  }

  const tiers = [
    { label: pricing.smallLabel, detail: pricing.smallDetail },
    { label: pricing.mediumLabel, detail: pricing.mediumDetail },
    { label: pricing.largeLabel, detail: pricing.largeDetail },
  ];

  return (
    <main className='gb-luxury-page min-h-screen bg-black text-white'>
      <section className='relative overflow-hidden border-b border-gold/20'>
        <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(212,166,77,0.18),transparent_30%),linear-gradient(110deg,rgba(0,0,0,0.82),rgba(0,0,0,0.92))]' />
        <div className='relative mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:px-8'>
          <div>
            <p className='text-xs font-black uppercase tracking-[0.3em] text-gold-soft'>Gloss Boss ATX Fleet Care</p>
            <h1 className='mt-4 text-4xl font-black uppercase leading-none sm:text-6xl'>Premium mobile detailing for business fleets</h1>
            <p className='mt-5 max-w-2xl text-base leading-7 text-zinc-300'>{blurb}</p>
            <div className='mt-8 flex flex-wrap gap-3'>
              <a href='#fleet-inquiry' className='rounded-xl bg-gold px-6 py-3 text-sm font-black uppercase text-black'>Request fleet quote</a>
              <Link href='/book' className='rounded-xl border border-white/15 px-6 py-3 text-sm font-black uppercase text-white'>Book one vehicle</Link>
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
