'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Archive, Bell, CheckCheck, ExternalLink, Mail, MessageSquare, Smartphone } from 'lucide-react';
import type { TitanNotificationEvent } from '@/lib/titan/notification-events';
import { groupNotificationsByDay } from '@/lib/titan/notification-events';
import {
  archiveNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/app/(dashboard)/admin/notifications/titan-notification-actions';
import { useToast } from '@/components/ui/toast-provider';

function channelChip(label: string, status: string | null) {
  if (!status || status === 'skipped' || status === 'not_configured') return null;
  const ok = status === 'sent' || status === 'delivered';
  const quiet = status === 'quiet_hours';
  return (
    <span
      key={label}
      className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
        ok ? 'bg-emerald-500/20 text-emerald-300' : quiet ? 'bg-zinc-500/20 text-zinc-400' : 'bg-rose-500/20 text-rose-300'
      }`}
    >
      {label} {status}
    </span>
  );
}

function priorityChip(priority: string) {
  const map: Record<string, string> = {
    urgent: 'bg-rose-500/25 text-rose-200',
    high: 'bg-amber-500/20 text-amber-200',
    normal: 'bg-white/5 text-zinc-400',
    low: 'bg-white/5 text-zinc-600',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${map[priority] ?? map.normal}`}>
      {priority}
    </span>
  );
}

function NotificationCard({
  evt,
  onRead,
  onArchive,
}: {
  evt: TitanNotificationEvent;
  onRead: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const unread = !evt.readAt;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`group relative overflow-hidden rounded-2xl border p-4 backdrop-blur-xl transition ${
        unread
          ? 'border-gold/30 bg-gradient-to-br from-gold/10 via-black/60 to-black/80 shadow-[0_0_24px_rgba(212,175,55,0.12)]'
          : 'border-white/8 bg-black/45 opacity-90'
      }`}
    >
      {unread ? (
        <span className="absolute right-4 top-4 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
        </span>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pr-8">
        {priorityChip(evt.priority)}
        {evt.source ? <span className="text-[10px] font-bold uppercase text-zinc-500">{evt.source}</span> : null}
        <span className="text-[10px] text-zinc-600">{new Date(evt.createdAt).toLocaleString()}</span>
      </div>

      <button
        type="button"
        className="mt-2 w-full text-left"
        onClick={() => {
          onRead(evt.id);
          if (evt.relatedUrl) window.location.href = evt.relatedUrl;
        }}
      >
        <h3 className="text-sm font-black text-white">{evt.title}</h3>
        <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-zinc-400">{evt.body}</p>
      </button>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {channelChip('Email', evt.emailStatus)}
        {channelChip('SMS', evt.smsStatus)}
        {channelChip('Push', evt.pushoverStatus)}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 opacity-0 transition group-hover:opacity-100">
        {evt.relatedUrl ? (
          <Link
            href={evt.relatedUrl}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[10px] font-black uppercase text-zinc-300"
          >
            <ExternalLink className="h-3 w-3" /> Open
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => onArchive(evt.id)}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[10px] font-black uppercase text-zinc-400"
        >
          <Archive className="h-3 w-3" /> Archive
        </button>
      </div>
    </motion.article>
  );
}

function Section({ title, events, onRead, onArchive }: { title: string; events: TitanNotificationEvent[]; onRead: (id: string) => void; onArchive: (id: string) => void }) {
  if (events.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{title}</h2>
      <div className="space-y-3">
        {events.map((evt) => (
          <NotificationCard key={evt.id} evt={evt} onRead={onRead} onArchive={onArchive} />
        ))}
      </div>
    </section>
  );
}

export function TitanNotificationHub({
  initialEvents,
  tablesReady,
  unreadCount: initialUnread,
}: {
  initialEvents: TitanNotificationEvent[];
  tablesReady: boolean;
  unreadCount: number;
}) {
  const toast = useToast();
  const [events, setEvents] = useState(initialEvents);
  const [unread, setUnread] = useState(initialUnread);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setEvents(initialEvents);
    setUnread(initialUnread);
  }, [initialEvents, initialUnread]);

  const grouped = groupNotificationsByDay(events);

  const markRead = (id: string) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, readAt: new Date().toISOString() } : e)));
    setUnread((n) => Math.max(0, n - 1));
    startTransition(async () => {
      await markNotificationReadAction(id);
    });
  };

  const archive = (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    startTransition(async () => {
      await archiveNotificationAction(id);
      toast.info('Archived', 'Notification removed from inbox.');
    });
  };

  if (!tablesReady) {
    return (
      <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-6">
        <p className="text-sm text-amber-100">Apply migration <code className="text-amber-200">000108_titan_notifications_scan.sql</code> in Supabase.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-gold/20 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.12),transparent_50%),rgba(0,0,0,0.55)] p-6 backdrop-blur-xl">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-gold-soft">
            <Bell className="h-4 w-4" /> Titan alerts
          </p>
          <h1 className="mt-2 text-2xl font-black text-white">Notification Center</h1>
          <p className="mt-1 text-sm text-zinc-400">Bookings, payments, leads, and system events — with delivery status.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {unread > 0 ? (
            <span className="rounded-full bg-rose-500/20 px-3 py-1.5 text-xs font-black text-rose-200">{unread} unread</span>
          ) : null}
          <button
            type="button"
            disabled={pending || unread === 0}
            onClick={() => {
              startTransition(async () => {
                await markAllNotificationsReadAction();
                setEvents((prev) => prev.map((e) => ({ ...e, readAt: e.readAt ?? new Date().toISOString() })));
                setUnread(0);
                toast.success('All read', 'Inbox cleared.');
              });
            }}
            className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-4 py-2 text-[10px] font-black uppercase text-white disabled:opacity-40"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Mail, label: 'Email channel', hint: 'Resend owner alerts' },
          { icon: MessageSquare, label: 'SMS channel', hint: 'Twilio owner texts' },
          { icon: Smartphone, label: 'Pushover', hint: 'Phone app push' },
        ].map(({ icon: Icon, label, hint }) => (
          <div key={label} className="rounded-2xl border border-white/8 bg-black/40 p-4 backdrop-blur-md">
            <Icon className="h-4 w-4 text-gold-soft" />
            <p className="mt-2 text-xs font-bold text-white">{label}</p>
            <p className="text-[10px] text-zinc-500">{hint}</p>
          </div>
        ))}
      </div>

      {events.length === 0 ? (
        <div className="rounded-3xl border border-white/8 bg-black/40 p-12 text-center backdrop-blur-md">
          <Bell className="mx-auto h-8 w-8 text-zinc-600" />
          <p className="mt-4 text-sm font-bold text-white">No alerts yet</p>
          <p className="mt-1 text-xs text-zinc-500">New bookings, payments, and Titan events will appear here.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <Section title="Today" events={grouped.today} onRead={markRead} onArchive={archive} />
          <Section title="Yesterday" events={grouped.yesterday} onRead={markRead} onArchive={archive} />
          <Section title="Older" events={grouped.older} onRead={markRead} onArchive={archive} />
        </div>
      )}
    </div>
  );
}
