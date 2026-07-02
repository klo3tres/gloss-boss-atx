'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Check, Clock, Sparkles } from 'lucide-react';
import { PremiumButton } from '@/components/premium/premium-button';
import { MotionFade } from '@/components/marketing/motion-fade';
import {
  isPopularService,
  serviceDurationLabel,
  serviceFallbackImage,
  servicePresentation,
} from '@/lib/marketing/service-presentation';
import { formatVehiclePrice, type ServicePackage } from '@/lib/site-config';
import { mediaUrl, type MediaRegistry } from '@/lib/media-registry';

export function ServicePackageShowcase({
  service,
  mediaRegistry,
  index = 0,
  reverse = false,
}: {
  service: ServicePackage;
  mediaRegistry: MediaRegistry;
  index?: number;
  reverse?: boolean;
}) {
  const presentation = servicePresentation(service);
  const imageSrc = mediaUrl(mediaRegistry, presentation.imageKey) || serviceFallbackImage(service.id);
  const duration = serviceDurationLabel(service);
  const isQuoteOnly = service.quoteRequired || service.comingSoon;
  const popular = isPopularService(service);
  const articleRef = useRef<HTMLElement>(null);
  const [stickyVisible, setStickyVisible] = useState(false);

  useEffect(() => {
    const node = articleRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStickyVisible(entry.isIntersecting && entry.intersectionRatio < 0.65),
      { threshold: [0, 0.35, 0.65, 1] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const bookHref = isQuoteOnly ? '/#contact' : `/book?service=${service.id}&package=${service.id}`;

  return (
    <MotionFade delay={index * 0.06}>
      <article
        ref={articleRef}
        className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/60 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl transition duration-500 hover:border-gold/25 hover:shadow-[0_28px_90px_rgba(212,175,55,0.12)]"
      >
        <div className={`grid gap-0 lg:grid-cols-2 ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
          <div className="relative min-h-[300px] overflow-hidden lg:min-h-[420px]">
            <Image
              src={imageSrc}
              alt={service.title}
              fill
              unoptimized={imageSrc.startsWith('http')}
              className="object-cover transition duration-700 group-hover:scale-[1.03]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
            {popular ? (
              <span className="absolute left-5 top-5 rounded-full border border-gold/40 bg-black/70 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-gold-soft backdrop-blur">
                Most booked
              </span>
            ) : null}
            <div className="absolute bottom-5 left-5 right-5">
              <p className="text-sm leading-relaxed text-zinc-200">{presentation.ideal}</p>
            </div>
          </div>

          <div className="flex flex-col justify-between p-6 sm:p-8 lg:p-10">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                  <Clock className="h-3 w-3 text-gold" />
                  {duration}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/20 bg-gold/5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gold-soft">
                  <Sparkles className="h-3 w-3" />
                  Member savings
                </span>
              </div>

              <h2 className="mt-4 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">{service.title}</h2>
              {service.subtitle ? <p className="mt-2 text-sm text-zinc-400">{service.subtitle}</p> : null}
              {service.publicDescription ? (
                <p className="mt-4 text-sm leading-relaxed text-zinc-300">{service.publicDescription}</p>
              ) : null}

              {!isQuoteOnly ? (
                <div className="mt-6 grid grid-cols-3 gap-2 sm:max-w-md">
                  {[
                    { label: 'Sedan', value: formatVehiclePrice(service.sedanPrice), hint: 'starting at' },
                    { label: 'SUV', value: formatVehiclePrice(service.suvPrice ?? service.suvTruckPrice), hint: 'starting at' },
                    { label: 'Truck', value: formatVehiclePrice(service.truckPrice ?? service.suvTruckPrice), hint: 'starting at' },
                  ].map((tier) => (
                    <div
                      key={tier.label}
                      className="rounded-2xl border border-white/8 bg-gradient-to-b from-zinc-900/80 to-black/60 px-3 py-3 text-center"
                    >
                      <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">{tier.hint}</p>
                      <p className="text-[9px] font-bold uppercase text-zinc-400">{tier.label}</p>
                      <p className="mt-1 font-mono text-lg font-black text-gold-soft">{tier.value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-6 inline-flex rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-sm font-bold text-gold-soft">
                  Custom quote required
                </p>
              )}

              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">What you get</p>
                  <ul className="mt-3 grid gap-2">
                    {presentation.whatYouGet.map((line) => (
                      <li key={line} className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-black/40 px-3 py-2.5 text-xs text-zinc-300">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/10">
                          <Check className="h-3 w-3 text-gold-soft" strokeWidth={3} />
                        </span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Best for</p>
                  <p className="mt-3 rounded-2xl border border-gold/15 bg-gold/5 px-4 py-3 text-sm leading-relaxed text-zinc-200">
                    {presentation.bestFor}
                  </p>
                  <p className="mt-6 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Expected results</p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {presentation.expectedResults.map((result) => (
                      <li
                        key={result}
                        className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-[10px] font-semibold text-emerald-100"
                      >
                        {result}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {service.includes.length > 0 ? (
                <div className="mt-6">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Also included</p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {service.includes.map((line) => (
                      <li key={line} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] text-zinc-400">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-6">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Recommended add-ons</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {presentation.recommendedAddons.map((addon) => (
                    <span
                      key={addon}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] font-medium text-zinc-400"
                    >
                      {addon}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              {isQuoteOnly ? (
                <PremiumButton href="/#contact" variant="primary">
                  Request quote
                </PremiumButton>
              ) : (
                <PremiumButton href={`/book?service=${service.id}&package=${service.id}`} variant="primary">
                  Book now
                </PremiumButton>
              )}
              <PremiumButton href="/memberships" variant="ghost">
                Member pricing
              </PremiumButton>
            </div>
          </div>
        </div>

        <div
          className={`fixed bottom-0 left-0 right-0 z-40 border-t border-gold/25 bg-black/90 px-4 py-3 backdrop-blur-xl transition duration-300 lg:hidden ${
            stickyVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'
          }`}
        >
          <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-black uppercase text-white">{service.title}</p>
              <p className="text-[10px] text-zinc-500">{duration}</p>
            </div>
            <PremiumButton href={bookHref} variant="primary" className="shrink-0 px-4 py-2.5 text-[9px]">
              {isQuoteOnly ? 'Quote' : 'Book'}
            </PremiumButton>
          </div>
        </div>
      </article>
    </MotionFade>
  );
}
