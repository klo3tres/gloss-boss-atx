import Link from 'next/link';
import { Phone, ShieldCheck, Star, Truck, Zap } from 'lucide-react';

export function ServicesTrustBand() {
  const items = [
    { icon: Truck, label: 'We come to you', detail: 'Mobile · water & power included' },
    { icon: ShieldCheck, label: 'Licensed & insured', detail: 'Professional field standards' },
    { icon: Star, label: '5-star rated', detail: 'Austin luxury detailing' },
    { icon: Zap, label: 'Book in minutes', detail: 'Secure Stripe deposit online' },
  ];

  return (
    <section className="mb-10 -mt-6 relative z-20 mx-auto max-w-5xl px-4 sm:px-0">
      <div className="grid gap-3 rounded-2xl border border-gold/20 bg-black/80 p-4 shadow-xl backdrop-blur-md sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ icon: Icon, label, detail }) => (
          <div key={label} className="flex min-w-0 items-start gap-3 rounded-xl border border-white/5 bg-zinc-950/50 p-3">
            <Icon className="h-5 w-5 shrink-0 text-gold-soft" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-black uppercase text-white">{label}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">{detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ServicesHeroActions() {
  return (
    <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
      <Link
        href="/book"
        className="inline-flex min-h-[48px] w-full max-w-xs items-center justify-center rounded-xl bg-gold px-6 py-3 text-xs font-black uppercase tracking-wider text-black shadow-[0_0_24px_rgba(212,175,55,0.35)] hover:bg-gold-soft sm:w-auto"
      >
        Book your detail
      </Link>
      <a
        href="tel:+15124812319"
        className="inline-flex min-h-[48px] w-full max-w-xs items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/50 px-6 py-3 text-xs font-black uppercase tracking-wider text-white hover:border-gold/40 sm:w-auto"
      >
        <Phone className="h-4 w-4 text-gold-soft" />
        Call to book
      </a>
    </div>
  );
}

export function ServicesMobileBookBar() {
  return (
    <div className="fixed bottom-0 inset-x-0 z-50 border-t border-gold/25 bg-black/95 p-3 backdrop-blur-lg lg:hidden">
      <div className="mx-auto flex max-w-lg gap-2">
        <Link
          href="/book"
          className="flex flex-1 items-center justify-center rounded-xl bg-gold py-3 text-xs font-black uppercase text-black"
        >
          Book now
        </Link>
        <Link
          href="/memberships"
          className="flex items-center justify-center rounded-xl border border-white/15 px-4 py-3 text-[10px] font-black uppercase text-white"
        >
          Plans
        </Link>
      </div>
    </div>
  );
}
