'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Check, ChevronDown, Clock } from 'lucide-react';
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
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <MotionFade delay={index * 0.05}>
      <article className="group overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition hover:border-gold/25">
        <div className={`grid gap-0 lg:grid-cols-2 ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
          <div className="relative min-h-[260px] overflow-hidden lg:min-h-[380px]">
            <Image
              src={imageSrc}
              alt={service.title}
              fill
              unoptimized={imageSrc.startsWith('http')}
              className="object-cover transition duration-700 group-hover:scale-[1.02]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            {popular ? (
              <span className="absolute left-4 top-4 rounded-full border border-gold/40 bg-black/60 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-gold-soft backdrop-blur">
                Most booked
              </span>
            ) : null}
            <p className="absolute bottom-4 left-4 right-4 text-sm leading-relaxed text-white/90">{presentation.ideal}</p>
          </div>

          <div className="flex flex-col p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3 w-3 text-gold" />
                {duration}
              </span>
            </div>

            <h2 className="mt-3 text-2xl font-black uppercase tracking-tight text-foreground sm:text-3xl">{service.title}</h2>
            {service.subtitle ? <p className="mt-1 text-sm text-muted-foreground">{service.subtitle}</p> : null}

            {!isQuoteOnly ? (
              <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-sm">
                {[
                  { label: 'Sedan', value: formatVehiclePrice(service.sedanPrice) },
                  { label: 'SUV', value: formatVehiclePrice(service.suvPrice ?? service.suvTruckPrice) },
                  { label: 'Truck', value: formatVehiclePrice(service.truckPrice ?? service.suvTruckPrice) },
                ].map((tier) => (
                  <div key={tier.label} className="rounded-xl border border-border bg-muted/30 px-2 py-2.5 text-center">
                    <p className="text-[9px] font-bold uppercase text-muted-foreground">{tier.label}</p>
                    <p className="mt-0.5 font-mono text-base font-black text-gold-soft">{tier.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-5 inline-flex rounded-xl border border-gold/30 bg-gold/10 px-4 py-2 text-sm font-bold text-gold-soft">
                Custom quote required
              </p>
            )}

            <ul className="mt-5 space-y-2">
              {presentation.whatYouGet.slice(0, 4).map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm text-foreground/90">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold-soft" strokeWidth={2.5} />
                  {line}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              className="mt-4 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-gold-soft hover:underline"
            >
              {detailsOpen ? 'Hide' : 'View'} full details
              <ChevronDown className={`h-3.5 w-3.5 transition ${detailsOpen ? 'rotate-180' : ''}`} />
            </button>

            {detailsOpen ? (
              <div className="mt-4 space-y-4 border-t border-border pt-4 text-sm">
                {service.publicDescription ? (
                  <p className="leading-relaxed text-muted-foreground">{service.publicDescription}</p>
                ) : null}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Best for</p>
                  <p className="mt-1 text-foreground/90">{presentation.bestFor}</p>
                </div>
                {presentation.expectedResults.length > 0 ? (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Expected results</p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {presentation.expectedResults.map((result) => (
                        <li key={result} className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[10px] text-foreground/80">
                          {result}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {service.includes.length > 0 ? (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Also included</p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {service.includes.map((line) => (
                        <li key={line} className="rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground">
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {presentation.recommendedAddons.length > 0 ? (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Recommended add-ons</p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {presentation.recommendedAddons.map((addon) => (
                        <li key={addon} className="rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground">
                          {addon}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              {isQuoteOnly ? (
                <PremiumButton href="/#contact" variant="primary">
                  Request quote
                </PremiumButton>
              ) : (
                <PremiumButton href={`/book?service=${service.id}&package=${service.id}`} variant="primary">
                  Book now
                </PremiumButton>
              )}
            </div>
          </div>
        </div>
      </article>
    </MotionFade>
  );
}
