import Link from 'next/link';
import Image from 'next/image';
import { Building2, CalendarCheck, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { FleetInquiryForm } from '@/components/public/fleet-inquiry-form';
import { SocialLinksRow } from '@/components/marketing/social-links';
import { DEFAULT_FLEET_PRICING, parseFleetPricing } from '@/lib/fleet-pricing';
import { mediaUrl, normalizeMediaRegistry } from '@/lib/media-registry';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function FleetPage() {
  const admin = tryCreateAdminSupabase();
  let blurb = 'Recurring mobile detailing for business fleets, dealerships, executive teams, and property-managed vehicle groups.';
  let pricing = { ...DEFAULT_FLEET_PRICING };
  let registry = {};
  let socialLinks = { instagramUrl: '', tiktokUrl: '', youtubeUrl: '', facebookUrl: '' };
  if (admin) {
    const { data } = await admin
      .from('site_settings')
      .select('key, value')
      .in('key', ['fleet_services_blurb', 'fleet_pricing', 'media_registry', 'social_instagram_url', 'social_tiktok_url', 'social_youtube_url', 'social_facebook_url'])
      .limit(20);
    const rows = (data ?? []) as Record<string, unknown>[];
    blurb = String(rows.find((r) => r.key === 'fleet_services_blurb')?.value ?? blurb);
    const raw = rows.find((r) => r.key === 'fleet_pricing')?.value;
    try {
      pricing = parseFleetPricing(typeof raw === 'string' ? JSON.parse(raw) : raw);
    } catch {
      pricing = { ...DEFAULT_FLEET_PRICING };
    }
    registry = normalizeMediaRegistry(rows.find((r) => r.key === 'media_registry')?.value ?? null);
    socialLinks = {
      instagramUrl: String(rows.find((r) => r.key === 'social_instagram_url')?.value ?? ''),
      tiktokUrl: String(rows.find((r) => r.key === 'social_tiktok_url')?.value ?? ''),
      youtubeUrl: String(rows.find((r) => r.key === 'social_youtube_url')?.value ?? ''),
      facebookUrl: String(rows.find((r) => r.key === 'social_facebook_url')?.value ?? ''),
    };
  }

  const tiers = [
    { label: pricing.smallLabel, detail: pricing.smallDetail },
    { label: pricing.mediumLabel, detail: pricing.mediumDetail },
    { label: pricing.largeLabel, detail: pricing.largeDetail },
  ];

  return (
    <main className="gb-marketing-page gb-luxury-page min-h-screen bg-background text-foreground">
      <section className="relative overflow-hidden border-b border-border">
        <Image
          src={mediaUrl(registry, 'fleet.hero')}
          alt="Gloss Boss ATX fleet detailing"
          fill
          priority
          unoptimized={mediaUrl(registry, 'fleet.hero').startsWith('http')}
          className="object-cover opacity-25"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/70" />
        <div className="relative mx-auto grid max-w-5xl gap-10 px-5 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-gold-soft">Fleet & commercial</p>
            <h1 className="mt-4 text-4xl font-black uppercase leading-tight sm:text-5xl">
              Premium mobile detailing for business fleets
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">{blurb}</p>
            <SocialLinksRow links={socialLinks} className="mt-5" />
            <div className="mt-7 grid max-w-2xl gap-3 sm:grid-cols-3">
              {['Work trucks', 'Company vehicles', 'Executive fleets'].map((item) => (
                <div key={item} className="gb-premium-card rounded-2xl border border-border p-4">
                  <p className="text-sm font-black text-foreground">{item}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Recurring on-site care</p>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#fleet-inquiry" className="rounded-xl bg-gold px-6 py-3 text-sm font-black uppercase text-black shadow-[0_0_24px_rgba(212,166,77,0.25)] transition hover:brightness-110">
                Request fleet quote
              </a>
              <Link href="/book" className="rounded-xl border border-border bg-card px-6 py-3 text-sm font-black uppercase text-foreground transition hover:border-gold/35">
                Book one vehicle
              </Link>
            </div>
          </div>
          <div className="gb-premium-card rounded-3xl border border-gold/20 p-6">
            <Building2 className="h-8 w-8 text-gold-soft" />
            <h2 className="mt-4 text-xl font-black uppercase">Built for operators</h2>
            <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
              <li><strong className="text-foreground">Scheduled routes</strong> — weekly, bi-weekly, or custom cadence.</li>
              <li><strong className="text-foreground">Documented work</strong> — photos and records per vehicle.</li>
              <li><strong className="text-foreground">On-site efficiency</strong> — offices, lots, and managed properties.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-14 lg:px-8">
        <div className="mb-10 grid gap-4 md:grid-cols-3">
          {tiers.map((tier) => (
            <div key={tier.label} className="gb-premium-card rounded-3xl border border-border p-6">
              <Truck className="h-6 w-6 text-gold-soft" />
              <p className="mt-4 text-lg font-black text-foreground">{tier.label}</p>
              <p className="mt-2 text-sm text-muted-foreground">{tier.detail}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['Recurring savings', `Weekly ${pricing.weeklyDiscount} · bi-weekly ${pricing.biweeklyDiscount} · monthly ${pricing.monthlyDiscount}`],
            ['Insured mobile service', 'Premium products, on-site documentation, and careful access notes.'],
            ['Fast quote flow', 'Tell us fleet size, locations, and cadence — we follow up with a usable plan.'],
          ].map(([title, copy], i) => {
            const Icon = i === 0 ? Sparkles : i === 1 ? ShieldCheck : CalendarCheck;
            return (
              <div key={title} className="rounded-2xl border border-border bg-card p-5">
                <Icon className="h-5 w-5 text-gold-soft" />
                <p className="mt-3 font-black text-foreground">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{copy}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section id="fleet-inquiry" className="mx-auto max-w-3xl px-5 pb-20 lg:px-8">
        <div className="gb-premium-card rounded-3xl border border-gold/20 p-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-gold-soft">Fleet quote request</p>
          <h2 className="mt-3 text-2xl font-black uppercase text-foreground">Build a recurring care plan</h2>
          <p className="mt-2 text-sm text-muted-foreground">{pricing.commercialNotes}</p>
          <FleetInquiryForm />
        </div>
      </section>
    </main>
  );
}
