'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { WorkspaceBrand } from '@/lib/brand/workspace-brand';
import { saveBrandSettingsAction } from '@/app/(dashboard)/admin/brand-settings/brand-settings-actions';

export function BrandSettingsClient({ brand, tablesReady }: { brand: WorkspaceBrand; tablesReady: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    businessDisplayName: brand.businessDisplayName,
    legalBusinessName: brand.legalBusinessName,
    brandShortName: brand.brandShortName,
    brandCityLabel: brand.brandCityLabel,
    brandSlug: brand.brandSlug,
    logoUrl: brand.logoUrl ?? '',
    iconUrl: brand.iconUrl ?? '',
    heroVideoUrl: brand.heroVideoUrl ?? '',
    heroVideoPosterUrl: brand.heroVideoPosterUrl ?? '',
    heroVideoEnabled: brand.heroVideoEnabled,
    primaryColor: brand.primaryColor,
    accentColor: brand.accentColor,
    supportEmail: brand.supportEmail ?? '',
    supportPhone: brand.supportPhone ?? '',
    websiteUrl: brand.websiteUrl,
    publicBookingUrl: brand.publicBookingUrl,
    gaMeasurementId: brand.gaMeasurementId ?? '',
    clarityProjectId: brand.clarityProjectId ?? '',
    gscVerificationNote: brand.gscVerificationNote ?? '',
  });

  const set = (key: keyof typeof form, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  if (!tablesReady) {
    return (
      <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        Apply migration <code className="text-gold-soft">000106_titan_polish_foundation.sql</code> to enable brand settings.
      </p>
    );
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        startTransition(async () => {
          const res = await saveBrandSettingsAction(form);
          if ('error' in res && res.error) setMsg(res.error);
          else {
            setMsg('Brand settings saved.');
            router.refresh();
          }
        });
      }}
    >
      <section className="rounded-2xl border border-white/10 bg-black/45 p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Public identity</p>
        <p className="mt-1 text-xs text-zinc-500">Public pages use display name. Legal docs use legal name. Titan uses short name.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            ['businessDisplayName', 'Business display name'],
            ['legalBusinessName', 'Legal business name'],
            ['brandShortName', 'Brand short name (Titan)'],
            ['brandCityLabel', 'City label'],
            ['brandSlug', 'Brand slug'],
          ].map(([key, label]) => (
            <label key={key} className="block text-xs text-zinc-400">
              {label}
              <input
                value={String(form[key as keyof typeof form])}
                onChange={(e) => set(key as keyof typeof form, e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/45 p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Contact & URLs</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            ['supportEmail', 'Support email'],
            ['supportPhone', 'Support phone'],
            ['websiteUrl', 'Website URL'],
            ['publicBookingUrl', 'Public booking URL'],
          ].map(([key, label]) => (
            <label key={key} className="block text-xs text-zinc-400">
              {label}
              <input
                value={String(form[key as keyof typeof form])}
                onChange={(e) => set(key as keyof typeof form, e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/45 p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Visual brand</p>
        <p className="mt-1 text-xs text-zinc-500">Use Media Studio for uploads. URLs here are optional fallbacks.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            ['logoUrl', 'Logo URL fallback'],
            ['iconUrl', 'Icon URL fallback'],
            ['heroVideoUrl', 'Hero video URL fallback'],
            ['heroVideoPosterUrl', 'Hero poster URL fallback'],
            ['primaryColor', 'Primary color'],
            ['accentColor', 'Accent color'],
          ].map(([key, label]) => (
            <label key={key} className="block text-xs text-zinc-400">
              {label}
              <input
                value={String(form[key as keyof typeof form])}
                onChange={(e) => set(key as keyof typeof form, e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white"
              />
            </label>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={form.heroVideoEnabled} onChange={(e) => set('heroVideoEnabled', e.target.checked)} />
          Enable homepage hero video (when Media Studio asset or URL is set)
        </label>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/45 p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Analytics IDs</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block text-xs text-zinc-400">
            Google Analytics Measurement ID
            <input value={form.gaMeasurementId} onChange={(e) => set('gaMeasurementId', e.target.value)} className="mt-1 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white" />
          </label>
          <label className="block text-xs text-zinc-400">
            Microsoft Clarity Project ID
            <input value={form.clarityProjectId} onChange={(e) => set('clarityProjectId', e.target.value)} className="mt-1 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white" />
          </label>
        </div>
        <label className="mt-3 block text-xs text-zinc-400">
          Google Search Console verification note
          <textarea
            rows={2}
            value={form.gscVerificationNote}
            onChange={(e) => set('gscVerificationNote', e.target.value)}
            placeholder="google-site-verification=..."
            className="mt-1 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white"
          />
        </label>
        <p className="mt-2 text-[10px] text-zinc-600">Add TXT record at DNS host @ with your google-site-verification value, then verify in Search Console.</p>
      </section>

      <button type="submit" disabled={pending} className="rounded-xl bg-gold px-6 py-3 text-[10px] font-black uppercase text-black disabled:opacity-50">
        {pending ? 'Saving…' : 'Save brand settings'}
      </button>
      {msg ? <p className="text-xs text-emerald-300">{msg}</p> : null}
    </form>
  );
}
