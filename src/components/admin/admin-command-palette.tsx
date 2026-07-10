'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command, Search, User, Briefcase, Target, Radar } from 'lucide-react';
import type { AdminSearchResult } from '@/app/api/admin/search/route';

const TYPE_ICON = {
  customer: User,
  work_order: Briefcase,
  opportunity: Target,
  lead: Radar,
} as const;

export function AdminCommandPalette({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setActiveIdx(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      setLoading(true);
      void fetch(`/api/admin/search?q=${encodeURIComponent(query.trim())}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((data: { results?: AdminSearchResult[] }) => setResults(data.results ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => window.clearTimeout(t);
  }, [open, query]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-[10px] font-black uppercase text-muted-foreground hover:border-gold/40 hover:text-foreground sm:inline-flex"
        title="Search (Ctrl+K)"
      >
        <Search className="h-3.5 w-3.5" />
        Search
        <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px]">⌘K</kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Command className="h-4 w-4 text-gold-soft" />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIdx(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActiveIdx((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActiveIdx((i) => Math.max(i - 1, 0));
                  }
                  if (e.key === 'Enter' && results[activeIdx]) go(results[activeIdx].href);
                }}
                placeholder="Search customers, jobs, opportunities…"
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {loading ? <p className="px-3 py-4 text-xs text-muted-foreground">Searching…</p> : null}
              {!loading && query.length >= 2 && results.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">No matches for &ldquo;{query}&rdquo;</p>
              ) : null}
              {results.map((r, idx) => {
                const Icon = TYPE_ICON[r.type];
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    type="button"
                    onClick={() => go(r.href)}
                    className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      idx === activeIdx ? 'bg-gold/15 border border-gold/30' : 'hover:bg-muted/50'
                    }`}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gold-soft" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">{r.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{r.subtitle}</p>
                    </div>
                    <span className="ml-auto shrink-0 text-[9px] font-black uppercase text-muted-foreground">{r.type.replace('_', ' ')}</span>
                  </button>
                );
              })}
              {query.length < 2 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">Type at least 2 characters to search across customers, work orders, and Titan opportunities.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
