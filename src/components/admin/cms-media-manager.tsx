'use client';

import Image from 'next/image';
import { useMemo, useRef, useState, useTransition } from 'react';
import { ImagePlus, RotateCcw, Trash2, UploadCloud } from 'lucide-react';
import { saveMediaRegistryAction } from '@/lib/admin/cms-media-actions';
import { MEDIA_REGISTRY_ITEMS, type MediaRegistry, mediaUrl } from '@/lib/media-registry';

type UploadState = Record<string, { busy?: boolean; error?: string; url?: string }>;

export function CmsMediaManager({ registry }: { registry: MediaRegistry }) {
  const groups = useMemo(() => {
    const all = Array.from(new Set(MEDIA_REGISTRY_ITEMS.map((item) => item.group)));
    const priority = ['Booking Wizard', 'Services'];
    return [...priority.filter((group) => all.includes(group)), ...all.filter((group) => !priority.includes(group))];
  }, []);
  const [values, setValues] = useState<MediaRegistry>(registry);
  const [uploadState, setUploadState] = useState<UploadState>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function uploadFile(key: string, file: File | null | undefined) {
    if (!file) return;
    setUploadState((prev) => ({ ...prev, [key]: { busy: true } }));
    const form = new FormData();
    form.set('file', file);
    form.set('slot', key.replace(/\./g, '-'));
    form.set('registryKey', key);
    try {
      const res = await fetch('/api/admin/homepage-visual-upload', {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !data.ok || !data.url) {
        setUploadState((prev) => ({ ...prev, [key]: { busy: false, error: data.error ?? 'Upload failed' } }));
        return;
      }
      setValues((prev) => ({ ...prev, [key]: data.url! }));
      setUploadState((prev) => ({ ...prev, [key]: { busy: false, url: data.url } }));
    } catch (e) {
      setUploadState((prev) => ({ ...prev, [key]: { busy: false, error: e instanceof Error ? e.message : 'Upload failed' } }));
    }
  }

  const [publishErr, setPublishErr] = useState<string | null>(null);
  const [publishOk, setPublishOk] = useState(false);
  const [pending, startTransition] = useTransition();

  const publish = () => {
    setPublishErr(null);
    setPublishOk(false);
    const form = new FormData();
    for (const item of MEDIA_REGISTRY_ITEMS) {
      const value = values[item.key] ?? '';
      if (value) form.set(item.key, value);
    }
    startTransition(async () => {
      const res = await saveMediaRegistryAction(form);
      if (res.error) setPublishErr(res.error);
      else setPublishOk(true);
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gold/20 bg-black/45 p-5">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-gold-soft">Central Media Manager</p>
        <h2 className="mt-2 text-2xl font-black uppercase text-white">Every public image has an owner</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Upload from your device, preview, replace, or reset every public visual. Uploads publish immediately. Empty slots use production fallbacks. URL entry is available under Advanced.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="#media-booking-wizard" className="rounded-xl bg-gold px-3 py-2 text-[10px] font-black uppercase text-black">Booking vehicle cards</a>
          <a href="#media-services" className="rounded-xl border border-gold/30 px-3 py-2 text-[10px] font-black uppercase text-gold-soft">Service page images</a>
        </div>
      </div>

      {groups.map((group) => (
        <section id={`media-${group.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} key={group} className="scroll-mt-6 rounded-3xl border border-white/10 bg-zinc-950/70 p-5">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">{group}</h3>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {MEDIA_REGISTRY_ITEMS.filter((item) => item.group === group).map((item) => {
              const savedValue = values[item.key] ?? '';
              const url = mediaUrl(values, item.key);
              const state = uploadState[item.key] ?? {};
              return (
                <div key={item.key} className="grid gap-3 rounded-2xl border border-white/10 bg-black/35 p-4 md:grid-cols-[150px_1fr]">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-black">
                    {url ? <Image src={url} alt={item.label} fill className="object-cover" unoptimized={url.startsWith('http')} /> : null}
                    {!savedValue ? (
                      <span className="absolute bottom-2 left-2 rounded-full border border-white/10 bg-black/70 px-2 py-1 text-[9px] font-black uppercase text-zinc-300">
                        Fallback
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-gold-soft">{item.label}</span>
                    <p className="mt-1 text-xs text-zinc-500">{item.description}</p>
                    <input type="hidden" name={item.key} value={savedValue} />
                    <input
                      ref={(el) => {
                        fileRefs.current[item.key] = el;
                      }}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="sr-only"
                      onChange={(e) => uploadFile(item.key, e.target.files?.[0])}
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => fileRefs.current[item.key]?.click()}
                        disabled={state.busy}
                        className="inline-flex items-center gap-2 rounded-xl bg-gold px-3 py-2 text-[10px] font-black uppercase tracking-wider text-black disabled:opacity-50"
                      >
                        {state.busy ? <UploadCloud className="h-3.5 w-3.5 animate-pulse" /> : <ImagePlus className="h-3.5 w-3.5" />}
                        {savedValue ? 'Replace image' : 'Upload image'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setValues((prev) => ({ ...prev, [item.key]: '' }))}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-300 hover:border-gold/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove / reset
                      </button>
                    </div>
                    <p className="mt-2 text-[10px] text-zinc-600">Fallback: {item.fallbackUrl}</p>
                    {state.error ? <p className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{state.error}</p> : null}
                    {state.url ? <p className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">Uploaded and published. Refresh the booking or services page to verify it.</p> : null}
                    <details className="mt-3">
                      <summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Advanced URL</summary>
                      <input
                        value={savedValue}
                        onChange={(e) => setValues((prev) => ({ ...prev, [item.key]: e.target.value }))}
                        placeholder={item.fallbackUrl}
                        className="mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-700 focus:border-gold/45"
                      />
                    </details>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <button
        type="button"
        disabled={pending}
        onClick={publish}
        className="rounded-xl bg-gold px-6 py-3 text-xs font-black uppercase tracking-[0.18em] text-black shadow-[0_0_24px_rgba(212,175,55,0.25)] disabled:opacity-50"
      >
        {pending ? 'Publishing…' : 'Publish all images'}
      </button>
      {publishOk ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Published successfully. Check /book and homepage to verify.
        </p>
      ) : null}
      {publishErr ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Publish failed: {publishErr}
          {/updated_at|schema cache/i.test(publishErr) ? ' — Run migration 000097 in Supabase.' : ''}
        </p>
      ) : null}
    </div>
  );
}
