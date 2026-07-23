'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, Bell, CheckCheck, MailOpen } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { TitanNotificationEvent } from '@/lib/titan/notification-events';
import { groupNotificationsByDay, mapTitanNotificationRow } from '@/lib/titan/notification-events';
import {
  archiveNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationUnreadAction,
} from '@/app/(dashboard)/admin/notifications/titan-notification-actions';

function mapRow(row: Record<string, unknown>): TitanNotificationEvent {
  return mapTitanNotificationRow(row);
}

export function NotificationBellDropdown({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<TitanNotificationEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const [{ data }, { count }] = await Promise.all([
      supabase
        .from('titan_notification_events')
        .select('*')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('titan_notification_events')
        .select('id', { count: 'exact', head: true })
        .is('archived_at', null)
        .is('read_at', null),
    ]);
    if (data) {
      const mapped = data.map((r) => mapRow(r as Record<string, unknown>));
      setEvents(mapped);
    }
    setUnread(count ?? 0);
  };

  useEffect(() => {
    setMounted(true);
    void load();
    const t = window.setInterval(() => void load(), 45000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const grouped = groupNotificationsByDay(events);
  const allEvents = [...grouped.today, ...grouped.yesterday, ...grouped.older];
  const list = filter === 'unread' ? allEvents.filter((event) => !event.readAt) : allEvents;

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
              {unread > 99 ? '99+' : unread}
            </span>
          </>
        ) : null}
      </button>

      {mounted ? createPortal(<AnimatePresence>
        {open ? (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="fixed right-3 top-20 z-[1000] flex max-h-[calc(100dvh-6rem)] w-[min(100vw-1.5rem,25rem)] flex-col overflow-hidden rounded-2xl border border-gold/25 bg-black/95 shadow-2xl backdrop-blur-2xl sm:right-6"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-4 py-3">
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
            <div className="flex shrink-0 gap-2 border-b border-white/8 px-3 py-2">
              {(['all', 'unread'] as const).map((value) => (
                <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-full px-3 py-1 text-[9px] font-black uppercase ${filter === value ? 'bg-gold text-black' : 'border border-white/10 text-zinc-400'}`}>
                  {value === 'all' ? `All (${allEvents.length})` : `Unread (${unread})`}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2" style={{ maxHeight: 'calc(70vh - 6.5rem)' }}>
              {list.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-zinc-500">No Titan alerts yet.</p>
              ) : (
                list.map((evt) => (
                  <div
                    key={evt.id}
                    className={`mb-2 w-full rounded-xl border p-3 text-left transition hover:border-gold/30 ${
                      evt.readAt ? 'border-white/6 bg-white/5' : 'border-gold/20 bg-gold/5'
                    }`}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => {
                        startTransition(async () => {
                          if (!evt.readAt) {
                            await markNotificationReadAction(evt.id);
                            setEvents((prev) =>
                              prev.map((e) => (e.id === evt.id ? { ...e, readAt: new Date().toISOString() } : e)),
                            );
                            setUnread((n) => Math.max(0, n - 1));
                          }
                        });
                        if (evt.relatedUrl) {
                          setOpen(false);
                          window.location.href = evt.relatedUrl;
                        }
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
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-4">
                      {evt.readAt ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            startTransition(async () => {
                              await markNotificationUnreadAction(evt.id);
                              setEvents((prev) => prev.map((e) => (e.id === evt.id ? { ...e, readAt: null } : e)));
                              setUnread((n) => n + 1);
                            });
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[9px] font-black uppercase text-zinc-400 hover:text-gold-soft"
                        >
                          <MailOpen className="h-3 w-3" /> Mark unread
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            startTransition(async () => {
                              await markNotificationReadAction(evt.id);
                              setEvents((prev) =>
                                prev.map((e) => (e.id === evt.id ? { ...e, readAt: new Date().toISOString() } : e)),
                              );
                              setUnread((n) => Math.max(0, n - 1));
                            });
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[9px] font-black uppercase text-zinc-400 hover:text-gold-soft"
                        >
                          <CheckCheck className="h-3 w-3" /> Mark read
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          startTransition(async () => {
                            await archiveNotificationAction(evt.id);
                            setEvents((prev) => prev.filter((e) => e.id !== evt.id));
                            if (!evt.readAt) setUnread((n) => Math.max(0, n - 1));
                          });
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[9px] font-black uppercase text-zinc-400 hover:text-amber-300"
                      >
                        <Archive className="h-3 w-3" /> Archive
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="shrink-0 border-t border-white/8 p-2">
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
      </AnimatePresence>, document.body) : null}
    </div>
  );
}
