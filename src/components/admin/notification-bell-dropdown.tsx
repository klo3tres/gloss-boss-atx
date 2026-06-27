'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CheckCheck } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { TitanNotificationEvent } from '@/lib/titan/notification-events';
import { groupNotificationsByDay } from '@/lib/titan/notification-events';
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/app/(dashboard)/admin/notifications/titan-notification-actions';

function mapRow(row: Record<string, unknown>): TitanNotificationEvent {
  const payload = row.provider_payload;
  return {
    id: String(row.id ?? ''),
    workspaceKey: String(row.workspace_key ?? 'default'),
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    source: row.source ? String(row.source) : null,
    priority: (String(row.priority ?? 'normal')) as TitanNotificationEvent['priority'],
    relatedType: row.related_type ? String(row.related_type) : null,
    relatedId: row.related_id ? String(row.related_id) : null,
    relatedUrl: row.related_url ? String(row.related_url) : null,
    readAt: row.read_at ? String(row.read_at) : null,
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    emailStatus: row.email_status ? String(row.email_status) : null,
    smsStatus: row.sms_status ? String(row.sms_status) : null,
    pushoverStatus: row.pushover_status ? String(row.pushover_status) : null,
    providerPayload:
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {},
    createdAt: String(row.created_at ?? ''),
  };
}

export function NotificationBellDropdown({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<TitanNotificationEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const { data } = await supabase
      .from('titan_notification_events')
      .select('*')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(12);
    if (data) {
      const mapped = data.map((r) => mapRow(r as Record<string, unknown>));
      setEvents(mapped);
      setUnread(mapped.filter((e) => !e.readAt).length);
    }
  };

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 45000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const grouped = groupNotificationsByDay(events);
  const preview = [...grouped.today, ...grouped.yesterday].slice(0, 6);

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative rounded-2xl border bg-black/55 p-3.5 text-gold-soft transition-all hover:border-gold/50 hover:bg-gold/10 ${
          unread > 0 ? 'border-gold/60 shadow-[0_0_32px_rgba(212,175,55,0.35)]' : 'border-gold/25'
        }`}
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 ? (
          <>
            <span className="absolute right-2 top-2 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
            </span>
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          </>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 z-[120] mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-gold/25 bg-black/90 shadow-2xl backdrop-blur-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
              <p className="text-xs font-black uppercase tracking-wider text-gold-soft">Alerts</p>
              <button
                type="button"
                disabled={pending || unread === 0}
                onClick={() => {
                  startTransition(async () => {
                    await markAllNotificationsReadAction();
                    setEvents((prev) => prev.map((e) => ({ ...e, readAt: e.readAt ?? new Date().toISOString() })));
                    setUnread(0);
                  });
                }}
                className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-zinc-400 disabled:opacity-40"
              >
                <CheckCheck className="h-3 w-3" /> All read
              </button>
            </div>
            <div className="max-h-[min(60vh,24rem)] overflow-y-auto p-2">
              {preview.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-zinc-500">No Titan alerts yet.</p>
              ) : (
                preview.map((evt) => (
                  <button
                    key={evt.id}
                    type="button"
                    className={`mb-2 w-full rounded-xl border p-3 text-left transition hover:border-gold/30 ${
                      evt.readAt ? 'border-white/6 bg-white/5' : 'border-gold/20 bg-gold/5'
                    }`}
                    onClick={() => {
                      startTransition(async () => {
                        await markNotificationReadAction(evt.id);
                        setEvents((prev) =>
                          prev.map((e) => (e.id === evt.id ? { ...e, readAt: new Date().toISOString() } : e)),
                        );
                        setUnread((n) => Math.max(0, n - 1));
                      });
                      setOpen(false);
                      if (evt.relatedUrl) window.location.href = evt.relatedUrl;
                    }}
                  >
                    <div className="flex items-start gap-2">
                      {!evt.readAt ? (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
                      ) : (
                        <span className="mt-1.5 h-2 w-2 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-white">{evt.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-[10px] text-zinc-400">{evt.body}</p>
                        <p className="mt-1 text-[9px] text-zinc-600">{new Date(evt.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-white/8 p-2">
              <Link
                href="/admin/notifications"
                onClick={() => setOpen(false)}
                className="block rounded-xl bg-gold/10 py-2.5 text-center text-[10px] font-black uppercase text-gold-soft"
              >
                Open notification center
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
