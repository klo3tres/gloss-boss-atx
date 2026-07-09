'use client';

import Link from 'next/link';
import { Calendar, ChevronRight } from 'lucide-react';
import type { BriefingJobPreview } from '@/lib/titan/executive-briefing';

export function BriefingCalendarPreview({
  todayJobs,
  upcomingJobs,
}: {
  todayJobs: BriefingJobPreview[];
  upcomingJobs: BriefingJobPreview[];
}) {
  const rows = [
    ...todayJobs.map((j) => ({ ...j, dayLabel: 'Today' })),
    ...upcomingJobs.slice(0, 4).map((j) => ({ ...j, dayLabel: 'Upcoming' })),
  ].slice(0, 6);

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gold-soft" />
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Schedule preview</p>
        </div>
        <Link href="/admin/calendar" className="text-[10px] font-black uppercase text-gold-soft hover:underline">
          Open calendar
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No jobs today or upcoming — time to run lead radar.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {rows.map((j) => (
            <li key={j.id}>
              <Link
                href={j.href}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2 text-xs transition hover:border-gold/25 hover:bg-muted/50"
              >
                <span className="min-w-0 truncate font-semibold text-foreground">{j.guestName}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{j.when}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href="/admin/dispatch"
        className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase text-gold-soft hover:underline"
      >
        Dispatch board <ChevronRight className="h-3 w-3" />
      </Link>
    </section>
  );
}
