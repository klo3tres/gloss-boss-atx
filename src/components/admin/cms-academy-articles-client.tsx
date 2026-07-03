'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { saveAcademyArticlesAction } from '@/app/(dashboard)/admin/academy/actions';

export type CmsAcademyArticle = {
  id: string;
  title: string;
  summary: string;
  href: string;
  type: 'video' | 'article' | 'model' | 'tool';
  category: 'operations' | 'marketing' | 'finance' | 'ai' | 'detailing';
  duration?: string;
  provider?: string;
  published: boolean;
};

function emptyArticle(): CmsAcademyArticle {
  return {
    id: crypto.randomUUID(),
    title: '',
    summary: '',
    href: '',
    type: 'article',
    category: 'operations',
    duration: '',
    provider: '',
    published: true,
  };
}

export function CmsAcademyArticlesClient({ initial }: { initial: CmsAcademyArticle[] }) {
  const router = useRouter();
  const [items, setItems] = useState<CmsAcademyArticle[]>(initial.length ? initial : [emptyArticle()]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const update = (idx: number, patch: Partial<CmsAcademyArticle>) => {
    setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Articles appear in Admin → Business Academy. Use YouTube links, articles, or internal routes like <code className="text-gold-soft">/admin/revenue</code>.
      </p>
      {items.map((item, idx) => (
        <div key={item.id} className="rounded-2xl border border-white/10 bg-black/45 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase text-gold-soft">Article {idx + 1}</p>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
              className="rounded-lg border border-red-500/30 p-1.5 text-red-300"
              aria-label="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-zinc-500 sm:col-span-2">
              Title
              <input value={item.title} onChange={(e) => update(idx, { title: e.target.value })} className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white" />
            </label>
            <label className="block text-xs text-zinc-500 sm:col-span-2">
              Summary
              <textarea value={item.summary} onChange={(e) => update(idx, { summary: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white" />
            </label>
            <label className="block text-xs text-zinc-500 sm:col-span-2">
              Link URL
              <input value={item.href} onChange={(e) => update(idx, { href: e.target.value })} placeholder="https://... or /admin/..." className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white" />
            </label>
            <label className="block text-xs text-zinc-500">
              Type
              <select value={item.type} onChange={(e) => update(idx, { type: e.target.value as CmsAcademyArticle['type'] })} className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white">
                <option value="video">Video</option>
                <option value="article">Article</option>
                <option value="model">Model</option>
                <option value="tool">Tool</option>
              </select>
            </label>
            <label className="block text-xs text-zinc-500">
              Category
              <select value={item.category} onChange={(e) => update(idx, { category: e.target.value as CmsAcademyArticle['category'] })} className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white">
                <option value="operations">Operations</option>
                <option value="marketing">Marketing</option>
                <option value="finance">Finance</option>
                <option value="ai">AI & Titan</option>
                <option value="detailing">Detailing</option>
              </select>
            </label>
            <label className="block text-xs text-zinc-500">
              Duration (optional)
              <input value={item.duration ?? ''} onChange={(e) => update(idx, { duration: e.target.value })} className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white" />
            </label>
            <label className="block text-xs text-zinc-500">
              Provider
              <input value={item.provider ?? ''} onChange={(e) => update(idx, { provider: e.target.value })} className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white" />
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-400 sm:col-span-2">
              <input type="checkbox" checked={item.published} onChange={(e) => update(idx, { published: e.target.checked })} />
              Published in Academy
            </label>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setItems((prev) => [...prev, emptyArticle()])} className="inline-flex items-center gap-1 rounded-xl border border-white/15 px-4 py-2 text-[10px] font-black uppercase text-white">
          <Plus className="h-3.5 w-3.5" /> Add article
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setMsg(null);
              const res = await saveAcademyArticlesAction(items.filter((i) => i.title.trim() && i.href.trim()));
              setBusy(false);
              setMsg(res.error ?? 'Saved.');
              router.refresh();
            })();
          }}
          className="inline-flex items-center gap-1 rounded-xl bg-gold px-4 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" /> {busy ? 'Saving…' : 'Save academy articles'}
        </button>
      </div>
      {msg ? <p className="text-xs text-emerald-300">{msg}</p> : null}
    </div>
  );
}
