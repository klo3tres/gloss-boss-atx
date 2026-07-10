'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Archive, Bell, CheckCheck, ExternalLink, Mail, MessageSquare, Search, Smartphone, Filter } from 'lucide-react';
import type { TitanNotificationEvent } from '@/lib/titan/notification-events';
import { groupNotificationsByDay, mapTitanNotificationRow } from '@/lib/titan/notification-events';
import {
  archiveNotificationAction,
  archiveAllNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/app/(dashboard)/admin/notifications/titan-notification-actions';
import { useToast } from '@/components/ui/toast-provider';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

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
  onOpen,
  onArchive,
}: {
  evt: TitanNotificationEvent;
  onOpen: (evt: TitanNotificationEvent) => void;
  onArchive: (id: string) => void;
}) {
  const unread = !evt.readAt;
  const [hover, setHover] = useState(false);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`group relative overflow-hidden rounded-2xl border p-4 backdrop-blur-xl transition ${
        unread
          ? 'border-gold/30 bg-gradient-to-br from-gold/10 via-card to-card shadow-sm'
          : 'border-border bg-card/80 opacity-95'
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
        onClick={() => onOpen(evt)}
      >
        <h3 className="text-sm font-black text-foreground">{evt.title}</h3>
        <p className={`mt-1 text-xs leading-relaxed text-muted-foreground ${hover ? '' : 'line-clamp-2'}`}>{evt.body}</p>
      </button>

      <AnimatePresence>
        {hover && evt.body.length > 80 ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 rounded-xl border border-white/10 bg-black/80 p-3 text-[11px] text-zinc-300"
          >
            {evt.body}
          </motion.div>
        ) : null}
      </AnimatePresence>

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

function Section({ title, events, onOpen, onArchive }: { title: string; events: TitanNotificationEvent[]; onOpen: (evt: TitanNotificationEvent) => void; onArchive: (id: string) => void }) {
  if (events.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{title}</h2>
      <div className="space-y-3">
        {events.map((evt) => (
          <NotificationCard key={evt.id} evt={evt} onOpen={onOpen} onArchive={onArchive} />
        ))}
      </div>
    </section>
  );
}

export function TitanNotificationHub({
  initialEvents,
  tablesReady,
  unreadCount: initialUnread,
  compactHeader,
}: {
  initialEvents: TitanNotificationEvent[];
  tablesReady: boolean;
  unreadCount: number;
  compactHeader?: boolean;
}) {
  const toast = useToast();
  const [events, setEvents] = useState(initialEvents);
  const [unread, setUnread] = useState(initialUnread);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [live, setLive] = useState(false);
  const [detail, setDetail] = useState<TitanNotificationEvent | null>(null);

  useEffect(() => {
    setEvents(initialEvents);
    setUnread(initialUnread);
  }, [initialEvents, initialUnread]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !tablesReady) return;

    let cancelled = false;

    const refresh = async () => {
      const { data } = await supabase
        .from('titan_notification_events')
        .select('*')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(150);
      if (cancelled || !data) return;
      const mapped = data.map((r) => mapTitanNotificationRow(r as Record<string, unknown>));
      setEvents(mapped);
      setUnread(mapped.filter((e) => !e.readAt).length);
      setLive(true);
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [tablesReady]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) if (e.source) set.add(e.source);
    return ['all', ...Array.from(set).sort()];
  }, [events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (showUnreadOnly && e.readAt) return false;
      if (sourceFilter !== 'all' && e.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.body.toLowerCase().includes(q) ||
        (e.source ?? '').toLowerCase().includes(q)
      );
    });
  }, [events, query, sourceFilter, showUnreadOnly]);

  const grouped = groupNotificationsByDay(filtered);

  const markRead = (id: string) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, readAt: new Date().toISOString() } : e)));
    setUnread((n) => Math.max(0, n - 1));
    startTransition(async () => {
      await markNotificationReadAction(id);
    });
  };

  const openDetail = (evt: TitanNotificationEvent) => {
    markRead(evt.id);
    setDetail(evt);
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
      {!compactHeader ? (
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-gold/20 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.12),transparent_50%),rgba(0,0,0,0.55)] p-6 backdrop-blur-xl">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-gold-soft">
            <Bell className="h-4 w-4" /> Activity Center
          </p>
          <h1 className="mt-2 text-2xl font-black text-white">Everything that happened</h1>
          <p className="mt-1 text-sm text-zinc-400">Bookings, payments, leads, calendar, weather, and system events.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {unread > 0 ? (
            <span className="rounded-full bg-rose-500/20 px-3 py-1.5 text-xs font-black text-rose-200">{unread} unread</span>
          ) : null}
          {live ? (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black uppercase text-emerald-200">
              Live
            </span>
          ) : null}
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-4 py-2 text-[10px] font-black uppercase text-zinc-300 hover:border-gold/30"
          >
            ← Briefing
          </Link>
          <button
            type="button"
            disabled={pending || events.length === 0}
            onClick={() => {
              startTransition(async () => {
                await archiveAllNotificationsAction();
                setEvents([]);
                setUnread(0);
                setDetail(null);
                toast.info('Archived', 'All notifications archived.');
              });
            }}
            className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2 text-[10px] font-black uppercase text-muted-foreground disabled:opacity-40"
          >
            <Archive className="h-3.5 w-3.5" /> Archive all
          </button>
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
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search activity…"
            className="w-full rounded-xl border border-white/10 bg-black/50 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-zinc-600"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-[10px] font-bold uppercase text-zinc-400">
            <Filter className="h-3.5 w-3.5" />
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="bg-transparent text-zinc-200 outline-none"
            >
              {sources.map((s) => (
                <option key={s} value={s} className="bg-black">
                  {s === 'all' ? 'All sources' : s}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setShowUnreadOnly((v) => !v)}
            className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase ${
              showUnreadOnly ? 'border-gold/40 bg-gold/10 text-gold-soft' : 'border-white/10 text-zinc-400'
            }`}
          >
            Unread only
          </button>
        </div>
      </div>

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

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-white/8 bg-black/40 p-12 text-center backdrop-blur-md">
          <Bell className="mx-auto h-8 w-8 text-zinc-600" />
          <p className="mt-4 text-sm font-bold text-white">No activity matches</p>
          <p className="mt-1 text-xs text-zinc-500">Try clearing filters or check back after your next booking.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <Section title="Today" events={grouped.today} onOpen={openDetail} onArchive={archive} />
          <Section title="Yesterday" events={grouped.yesterday} onOpen={openDetail} onArchive={archive} />
          <Section title="Earlier" events={grouped.older} onOpen={openDetail} onArchive={archive} />
        </div>
      )}

      <AnimatePresence>
        {detail ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 p-4 sm:items-center"
            onClick={() => setDetail(null)}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl"
            >
              <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">{detail.source ?? 'Activity'}</p>
              <h2 className="mt-2 text-lg font-black text-foreground">{detail.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{detail.body}</p>
              <p className="mt-2 text-[10px] text-muted-foreground/70">{new Date(detail.createdAt).toLocaleString()}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {detail.relatedUrl ? (
                  <Link
                    href={detail.relatedUrl}
                    className="inline-flex items-center gap-1 rounded-xl bg-gold px-4 py-2 text-[10px] font-black uppercase text-black"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    archive(detail.id);
                    setDetail(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2 text-[10px] font-black uppercase text-muted-foreground"
                >
                  <Archive className="h-3.5 w-3.5" /> Archive
                </button>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="rounded-xl border border-border px-4 py-2 text-[10px] font-black uppercase text-muted-foreground"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
