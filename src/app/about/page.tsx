import Link from 'next/link';
import { Award, ShieldCheck, Sparkles, Star, Trophy } from 'lucide-react';
import { MarketingSiteFooter } from '@/components/marketing/marketing-site-footer';

export const metadata = {
  title: 'About Our Craft | Gloss Boss ATX',
  description: 'The story, ethos, and standards of Austin’s premier mobile automotive detailing experts.',
};

export default function AboutPage() {
  const VALUES = [
    {
      title: 'Craftsman Standards',
      desc: 'We do not rush. Every corner, seam, and crevice is treated with detailing picks and fine microfiber to achieve true perfection.',
      Icon: Award,
    },
    {
      title: 'Completely Self-Powered',
      desc: 'Our bespoke detailing units carry onboard purified spot-free water and silent power generators. We need nothing from your home.',
      Icon: ShieldCheck,
    },
    {
      title: 'Exotics & Luxury Experts',
      desc: 'Trusted to handle multi-million dollar portfolios, rare collectors cars, paint protection films, and modern exotics.',
      Icon: Sparkles,
    },
  ];

  return (
    <main className="gb-marketing-page gb-luxury-page min-h-screen bg-background text-foreground">
      <section className="relative overflow-hidden px-4 pb-16 pt-24 sm:px-8 max-w-5xl mx-auto">
        <div className="gb-premium-hero rounded-3xl p-8 sm:p-12 relative overflow-hidden border border-border">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-gold-soft">Our legacy & purpose</p>
          <h1 className="mt-4 text-4xl sm:text-5xl font-black uppercase tracking-tight text-foreground leading-tight">
            A new standard for{' '}
            <span className="gb-text-gold-gradient">Austin automotive care</span>
          </h1>
          <p className="mt-6 max-w-2xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            Gloss Boss ATX was founded on a simple premise: vehicle detailing should not be a transactional chore.
            It is a meticulous craft that requires patience, elite chemistry, and a refusal to cut corners. We bring
            this museum-grade precision directly to your Austin driveway.
          </p>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-8 py-12">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-gold-soft">The Gloss Boss way</p>
          <h2 className="mt-2 text-2xl font-black uppercase text-foreground tracking-tight">Our core directives</h2>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {VALUES.map((v) => {
            const Icon = v.Icon;
            return (
              <div key={v.title} className="gb-premium-card rounded-2xl p-6 border border-border">
                <div className="h-11 w-11 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center text-gold-soft mb-4">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-black uppercase text-foreground mb-2">{v.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{v.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
        <div className="rounded-3xl border border-border bg-card p-8 sm:p-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Trophy className="h-32 w-32 text-gold" />
          </div>
          <div className="max-w-3xl">
            <h3 className="text-lg font-black uppercase text-foreground tracking-wider flex items-center gap-2">
              <Star className="h-5 w-5 text-gold fill-gold" /> Meticulous, not fast
            </h3>
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
              We choose to limit our scheduled routes each day so our technicians can focus entirely on the vehicle
              in front of them. Our high-pressure steam washers, paint correction systems, and premium glass-coatings
              are applied without stopwatch pressure. When we detail your vehicle, it receives our undivided attention.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-8 py-14 text-center">
        <h2 className="text-2xl sm:text-3xl font-black uppercase text-foreground">Experience detailing redefined</h2>
        <p className="mt-3 text-sm text-muted-foreground max-w-lg mx-auto">
          Select a package, enter your location, and lock in your driveway appointment in under two minutes.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/book" className="rounded-xl bg-gradient-to-r from-gold via-gold-soft to-gold px-8 py-3.5 text-xs font-black uppercase tracking-widest text-black shadow-lg hover:brightness-110 transition">
            Book driveway detailing
          </Link>
          <Link href="/services" className="rounded-xl border border-border bg-card px-8 py-3.5 text-xs font-black uppercase tracking-widest text-foreground hover:border-gold/30 transition">
            Explore packages
          </Link>
        </div>
      </section>

      <MarketingSiteFooter />
    </main>
  );
}
