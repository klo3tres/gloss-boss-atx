'use client';

import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { MotionFade } from '@/components/marketing/motion-fade';
import { formatStartingPrice, PRICING_DISCLAIMER, PRICING_DISCOUNT_RULES, type ServicePackage } from '@/lib/site-config';
import type { MediaRegistry } from '@/lib/media-registry';

const DEFAULT_COVERS: Record<string, string> = {
  'full-detail': 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=800&q=80',
  'exterior-wash': 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=800&q=80',
  'exterior-detail': 'https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=800&q=80',
  'interior-detail': 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=800&q=80',
  'ceramic-coating': 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=800&q=80',
};

function coverForService(service: ServicePackage, visuals: Record<string, unknown> | null) {
  const visualCover = (visuals?.services as { covers?: Record<string, { image?: string; fit?: string; position?: string }> } | undefined)
    ?.covers?.[service.id];
  return visualCover?.image || DEFAULT_COVERS[service.id] || DEFAULT_COVERS['full-detail'];
}

function objectStyle(config: { fit?: string; position?: string } | undefined) {
  return {
    objectFit: (config?.fit || 'cover') as React.CSSProperties['objectFit'],
    objectPosition: config?.position || 'center',
  };
}

export function HomeServicePackagesGrid({
  packages,
  visuals,
}: {
  packages: ServicePackage[];
  visuals: Record<string, unknown> | null;
}) {
  const items = packages.slice(0, 4);

  return (
    <>
      <div className="mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 pr-4 [-ms-overflow-style:none] [scrollbar-width:none] md:grid md:snap-none md:grid-cols-2 md:overflow-visible md:pb-0 md:pr-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
        {items.map((service, index) => {
          const visualCover = (visuals?.services as { covers?: Record<string, { image?: string; fit?: string; position?: string }> } | undefined)
            ?.covers?.[service.id];
          const coverUrl = coverForService(service, visuals);

          return (
            <MotionFade key={service.id} delay={index * 0.06}>
              <div className="min-w-[78%] snap-start sm:min-w-[52%] md:min-w-0">
                <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-gold/15 bg-zinc-950/80 shadow-lg transition duration-300 hover:-translate-y-1 hover:border-gold/40">
                  <div className="relative aspect-[16/10] overflow-hidden border-b border-white/5 bg-zinc-900">
                    <img
                      src={coverUrl}
                      alt={service.title}
                      style={objectStyle(visualCover)}
                      className="h-full w-full transition duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex flex-1 flex-col justify-between p-5">
                    <div>
                      <h3 className="text-lg font-black uppercase tracking-tight text-gold-soft">{service.title}</h3>
                      {service.subtitle ? (
                        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-zinc-400">{service.subtitle}</p>
                      ) : null}
                      <ul className="mt-4 space-y-1.5 border-t border-white/5 pt-3">
                        {(service.includes || []).slice(0, 4).map((inc) => (
                          <li key={inc} className="flex items-center gap-2 text-[11px] text-zinc-300">
                            <Check className="h-3.5 w-3.5 shrink-0 text-gold" />
                            <span className="truncate">{inc}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-3">
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-zinc-500">Starting price</p>
                        <p className="text-2xl font-black text-white">{formatStartingPrice(service.sedanPrice)}</p>
                      </div>
                      <Link
                        href={`/book?service=${service.id}&package=${service.id}`}
                        className="rounded-xl bg-gold/10 p-2.5 text-gold-soft transition group-hover:bg-gold group-hover:text-black"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </article>
              </div>
            </MotionFade>
          );
        })}
      </div>
      <div className="mt-8 space-y-1 text-center">
        <p className="mx-auto max-w-3xl text-[10px] leading-relaxed text-zinc-500">{PRICING_DISCLAIMER}</p>
        <p className="mx-auto max-w-3xl text-[10px] leading-relaxed text-zinc-500">{PRICING_DISCOUNT_RULES}</p>
      </div>
    </>
  );
}
