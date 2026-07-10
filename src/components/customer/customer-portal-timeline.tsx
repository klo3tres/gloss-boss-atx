'use client';

import { useEffect, useState } from 'react';
import { SectionEyebrow } from '@/components/ui/premium';

type TimelineEvent = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  occurredAt: string;
};

export function CustomerPortalTimeline() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/customer/timeline', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setEvents(Array.isArray(j.events) ? j.events : []))
      .catch(() => setEvents([]))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) {
    return <div className="h-24 animate-pulse rounded-2xl border border-border bg-muted/30" />;
  }

  if (events.length === 0) {
    return (
      <section className="gb-premium-card rounded-3xl border border-border p-5">
        <SectionEyebrow>Your timeline</SectionEyebrow>
        <p className="mt-2 text-sm text-muted-foreground">Book your first detail to start your service history.</p>
        <a href="/book" className="mt-3 inline-block rounded-xl bg-gold px-4 py-2 text-[10px] font-black uppercase text-black">
          Book now
        </a>
      </section>
    );
  }

  return (
    <section className="gb-premium-card rounded-3xl border border-border p-5">
      <SectionEyebrow>Your timeline</SectionEyebrow>
      <ul className="mt-4 space-y-3">
        {events.map((e) => (
          <li key={e.id} className="flex gap-3 border-b border-border pb-3 last:border-0">
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-gold-soft" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground">{e.title}</p>
              {e.detail ? <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{e.detail}</p> : null}
              <p className="mt-1 text-[10px] text-muted-foreground/70">
                {new Date(e.occurredAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
