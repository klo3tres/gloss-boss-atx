'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Award,
  Bell,
  Calendar,
  Camera,
  CreditCard,
  FileSignature,
  FileText,
  MessageSquare,
  Star,
  StickyNote,
  UserPlus,
  Wrench,
} from 'lucide-react';
import type { CustomerTimelineEvent, CustomerTimelineKind } from '@/lib/customer-timeline';
import { formatChicagoDate, formatChicagoDateTime } from '@/lib/chicago-time';

const KIND_LABELS: Record<CustomerTimelineKind, string> = {
  booking: 'Booking',
  job: 'Job',
  payment: 'Payment',
  receipt: 'Receipt',
  message: 'Message',
  notification: 'Notification',
  review: 'Review',
  photo: 'Photo',
  note: 'Note',
  agreement: 'Agreement',
  intake: 'Intake',
  lead: 'Lead',
  follow_up: 'Follow-up',
  estimate: 'Estimate',
  loyalty: 'Loyalty',
  credit: 'Credit',
  system: 'System',
};

function kindIcon(kind: CustomerTimelineKind) {
  switch (kind) {
    case 'payment':
    case 'receipt':
    case 'credit':
      return CreditCard;
    case 'message':
    case 'follow_up':
    case 'notification':
      return Bell;
    case 'review':
      return Star;
    case 'photo':
      return Camera;
    case 'note':
      return StickyNote;
    case 'agreement':
      return FileSignature;
    case 'intake':
      return FileText;
    case 'lead':
      return UserPlus;
    case 'loyalty':
      return Award;
    case 'booking':
      return Calendar;
    default:
      return Wrench;
  }
}

function kindColor(kind: CustomerTimelineKind) {
  if (kind === 'payment' || kind === 'receipt') return 'border-emerald-500/25 bg-emerald-500/5 text-emerald-300';
  if (kind === 'follow_up' || kind === 'notification') return 'border-sky-500/25 bg-sky-500/5 text-sky-300';
  if (kind === 'review') return 'border-amber-500/25 bg-amber-500/5 text-amber-300';
  if (kind === 'note') return 'border-violet-500/25 bg-violet-500/5 text-violet-300';
  if (kind === 'job' || kind === 'booking') return 'border-gold/25 bg-gold/5 text-gold-soft';
  return 'border-white/10 bg-black/40 text-zinc-400';
}

const FILTER_OPTIONS: { id: 'all' | CustomerTimelineKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'job', label: 'Jobs' },
  { id: 'payment', label: 'Payments' },
  { id: 'message', label: 'Messages' },
  { id: 'follow_up', label: 'Follow-ups' },
  { id: 'review', label: 'Reviews' },
  { id: 'photo', label: 'Photos' },
  { id: 'note', label: 'Notes' },
];

export function CustomerTimelineFeed({
  events,
  noteForm,
}: {
  events: CustomerTimelineEvent[];
  noteForm?: React.ReactNode;
}) {
  const [filter, setFilter] = useState<'all' | CustomerTimelineKind>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return events;
    if (filter === 'job') return events.filter((e) => e.kind === 'job' || e.kind === 'booking');
    if (filter === 'payment') return events.filter((e) => e.kind === 'payment' || e.kind === 'receipt');
    return events.filter((e) => e.kind === filter);
  }, [events, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, CustomerTimelineEvent[]>();
    for (const event of filtered) {
      const key = formatChicagoDate(event.occurredAt);
      const bucket = map.get(key) ?? [];
      bucket.push(event);
      map.set(key, bucket);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <section className="rounded-3xl border border-gold/20 bg-black/55 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Customer timeline</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Jobs, payments, messages, reviews, photos, and follow-ups in one feed.
          </p>
        </div>
        <p className="text-[10px] font-mono text-zinc-600">{events.length} events</p>
      </div>

      {noteForm ? <div className="mt-5">{noteForm}</div> : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setFilter(opt.id)}
            className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase transition ${
              filter === opt.id ? 'border-gold/40 bg-gold/10 text-gold-soft' : 'border-white/10 text-zinc-500 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-8">
        {grouped.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 py-12 text-center text-sm text-zinc-500">
            No timeline events yet for this filter.
          </p>
        ) : (
          grouped.map(([day, dayEvents]) => (
            <div key={day}>
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">{day}</p>
              <ol className="relative space-y-4 border-l border-white/10 pl-5">
                {dayEvents.map((event) => {
                  const Icon = kindIcon(event.kind);
                  return (
                    <li key={event.id} className="relative">
                      <span
                        className={`absolute -left-[1.65rem] flex h-7 w-7 items-center justify-center rounded-full border ${kindColor(event.kind)}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="rounded-2xl border border-white/5 bg-zinc-950/50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[9px] font-black uppercase text-zinc-500">{KIND_LABELS[event.kind]}</span>
                              <span className="font-mono text-[10px] text-zinc-600">{formatChicagoDateTime(event.occurredAt)}</span>
                            </div>
                            {event.href ? (
                              <Link href={event.href} className="mt-1 block text-sm font-black uppercase text-white hover:text-gold-soft">
                                {event.title}
                              </Link>
                            ) : (
                              <p className="mt-1 text-sm font-black uppercase text-white">{event.title}</p>
                            )}
                            {event.detail ? <p className="mt-1 text-xs leading-5 text-zinc-400">{event.detail}</p> : null}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
