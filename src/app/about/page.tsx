import Link from 'next/link';
import Image from 'next/image';
import { Award, ShieldCheck, Sparkles, Star, Trophy, Users, Heart } from 'lucide-react';
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
    <main className="gb-luxury-page min-h-screen bg-black text-white">
      {/* Header Nav */}
      <header className="border-b border-gold/15 bg-black/80 px-4 py-6 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link href="/" className="text-xs font-black uppercase tracking-[0.25em] text-gold-soft hover:brightness-110 transition">
            Gloss Boss ATX
          </Link>
          <nav className="flex items-center gap-4 text-xs font-bold uppercase tracking-wider">
            <Link href="/services" className="text-zinc-400 hover:text-gold-soft transition">
              Services
            </Link>
            <Link href="/gallery" className="text-zinc-400 hover:text-gold-soft transition">
              Gallery
            </Link>
            <Link href="/book" className="rounded-lg bg-gold px-4 py-2 text-black hover:bg-gold-soft transition font-black">
              Book
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden pt-20 pb-16 px-4 sm:px-8 max-w-7xl mx-auto">
        <div className="gb-premium-hero rounded-3xl p-8 sm:p-14 relative overflow-hidden">
          <div className="absolute inset-0 bg-radial-gradient(circle_at_right,rgba(212,175,55,0.1),transparent_40%)" />
          <p className="text-xs font-black uppercase tracking-[0.3em] text-gold-soft">Our Legacy & Purpose</p>
          <h1 className="mt-4 text-4.5xl sm:text-6xl font-black uppercase tracking-tight text-white leading-none">
            A New Standard for <br />
            <span className="bg-gradient-to-r from-gold via-gold-soft to-gold bg-clip-text text-transparent">Austin Automotive Care</span>
          </h1>
          <p className="mt-6 max-w-2xl text-sm sm:text-base text-zinc-300 leading-relaxed font-medium">
            Gloss Boss ATX was founded on a simple premise: vehicle detailing should not be a transactional chore. 
            It is a meticulous craft that requires patience, elite chemistry, and a refusal to cut corners. We bring 
            this museum-grade precision directly to your Austin driveway.
          </p>
        </div>
      </section>

      {/* Values Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-gold-soft">The Gloss Boss Way</p>
          <h2 className="mt-2 text-3xl font-black uppercase text-white tracking-tight">Our Core Directives</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {VALUES.map((v) => {
            const Icon = v.Icon;
            return (
              <div key={v.title} className="gb-premium-card rounded-2xl p-6 border border-gold/10 hover:border-gold/30 hover:scale-[1.01] transition duration-300">
                <div className="h-12 w-12 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center text-gold-soft mb-5">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-black uppercase text-white mb-2">{v.title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed font-medium">{v.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Ethos Block */}
      <section className="max-w-5xl mx-auto px-4 sm:px-8 py-12">
        <div className="rounded-3xl border border-white/5 bg-zinc-950/40 p-8 sm:p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <Trophy className="h-40 w-40 text-gold" />
          </div>
          <div className="max-w-3xl">
            <h3 className="text-xl font-black uppercase text-white tracking-wider flex items-center gap-2">
              <Star className="h-5 w-5 text-gold fill-gold" /> Meticulous, Not Fast
            </h3>
            <p className="mt-4 text-xs sm:text-sm text-zinc-400 leading-relaxed font-medium">
              We choose to limit our scheduled routes each day so our technicians can focus entirely on the vehicle 
              in front of them. Our high-pressure steam washers, paint correction systems, and premium glass-coatings 
              are applied without stopwatch pressure. When we detail your vehicle, it receives our undivided, absolute attention.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16 text-center">
        <h2 className="text-3xl sm:text-4xl font-black uppercase text-white">Experience Detailing Redefined</h2>
        <p className="mt-3 text-xs sm:text-sm text-zinc-400 max-w-lg mx-auto font-medium">
          Select a package, enter your location, and lock in your driveway appointment in under two minutes.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link href="/book" className="rounded-xl bg-gradient-to-r from-gold via-gold-soft to-gold px-8 py-4 text-xs font-black uppercase tracking-widest text-black shadow-lg hover:brightness-110 transition duration-300">
            Book Driveway Detailing
          </Link>
          <Link href="/services" className="rounded-xl border border-white/10 bg-zinc-950/60 px-8 py-4 text-xs font-black uppercase tracking-widest text-white hover:border-gold/30 transition duration-300">
            Explore Packages
          </Link>
        </div>
      </section>

      <MarketingSiteFooter />
    </main>
  );
}
