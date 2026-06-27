'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveTitanWorkspaceAction } from '@/app/(dashboard)/admin/super/titan-workspace-actions';
import type { TitanWorkspace, TitanIndustry } from '@/lib/titan/workspace';
import { INDUSTRY_LABELS } from '@/lib/titan/workspace';
import { displayMoney } from '@/lib/display-format';
import { Upload, Loader2 } from 'lucide-react';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function TitanWorkspaceForm({ workspace, compact = false }: { workspace: TitanWorkspace; compact?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<TitanWorkspace>(workspace);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [logoUploading, setLogoUploading] = useState(false);
  const [iconUploading, setIconUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, key: 'logo_url' | 'icon_url') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (key === 'logo_url') setLogoUploading(true);
    else setIconUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('settingKey', key);

    try {
      const res = await fetch('/api/admin/branding-upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.ok && data.url) {
        setForm((prev) => ({
          ...prev,
          [key === 'logo_url' ? 'logoUrl' : 'iconUrl']: data.url,
        }));
        setSaved(true);
        router.refresh();
      } else {
        setErr(data.error || 'Upload failed');
      }
    } catch (err) {
      console.error(err);
      setErr('Upload failed due to network issue');
    } finally {
      if (key === 'logo_url') setLogoUploading(false);
      else setIconUploading(false);
    }
  };

  const submit = () => {
    setErr(null);
    setSaved(false);
    startTransition(async () => {
      const res = await saveTitanWorkspaceAction({
        businessName: form.businessName,
        industry: form.industry,
        businessType: form.businessType,
        revenueModel: form.revenueModel,
        serviceRadiusMiles: form.serviceRadiusMiles,
        employeeCount: form.employeeCount,
        operatingHours: form.operatingHours,
        monthlyRevenueGoalCents: form.monthlyRevenueGoalCents,
        businessDisplayName: form.businessDisplayName,
        legalBusinessName: form.legalBusinessName,
        brandShortName: form.brandShortName,
        brandCityLabel: form.brandCityLabel,
        brandSlug: form.brandSlug,
        supportEmail: form.supportEmail,
        supportPhone: form.supportPhone,
        websiteUrl: form.websiteUrl,
        publicBookingUrl: form.publicBookingUrl,
        logoUrl: form.logoUrl,
        iconUrl: form.iconUrl,
      });
      if (res.error) setErr(res.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  };

  return (
    <section className={`rounded-3xl border border-white/10 bg-black/55 ${compact ? 'p-4' : 'p-6'}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Titan Business DNA</p>
      <p className="mt-1 text-sm text-zinc-500">Workspace settings — Titan uses these everywhere, not just Gloss Boss defaults.</p>
      
      <div className={`mt-4 grid gap-3 ${compact ? '' : 'sm:grid-cols-2'}`}>
        <label className="block text-xs">
          <span className="text-zinc-500">Business name (Internal / Legal Key)</span>
          <input
            value={form.businessName}
            onChange={(e) => setForm({ ...form, businessName: e.target.value })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-xs">
          <span className="text-zinc-500">Industry</span>
          <select
            value={form.industry}
            onChange={(e) => setForm({ ...form, industry: e.target.value as TitanIndustry })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
          >
            {(Object.keys(INDUSTRY_LABELS) as TitanIndustry[]).map((k) => (
              <option key={k} value={k}>
                {INDUSTRY_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-zinc-500">Business type</span>
          <select
            value={form.businessType}
            onChange={(e) => setForm({ ...form, businessType: e.target.value })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
          >
            <option value="owner_operator">Owner-operator</option>
            <option value="small_team">Small team (2–5)</option>
            <option value="multi_crew">Multi-crew</option>
            <option value="franchise">Franchise / multi-location</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-zinc-500">Revenue model</span>
          <select
            value={form.revenueModel}
            onChange={(e) => setForm({ ...form, revenueModel: e.target.value })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
          >
            <option value="per_job">Per job</option>
            <option value="membership">Membership / recurring</option>
            <option value="fleet_contract">Fleet / B2B contracts</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-zinc-500">Service radius (miles)</span>
          <input
            type="number"
            min={1}
            max={100}
            value={form.serviceRadiusMiles}
            onChange={(e) => setForm({ ...form, serviceRadiusMiles: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-xs">
          <span className="text-zinc-500">Employees</span>
          <input
            type="number"
            min={1}
            value={form.employeeCount}
            onChange={(e) => setForm({ ...form, employeeCount: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="text-zinc-500">Monthly revenue goal</span>
          <input
            type="number"
            min={0}
            step={100}
            value={Math.round(form.monthlyRevenueGoalCents / 100)}
            onChange={(e) => setForm({ ...form, monthlyRevenueGoalCents: Math.round(Number(e.target.value) * 100) })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
          />
          <span className="mt-1 block text-[10px] text-zinc-600">Current: {displayMoney(form.monthlyRevenueGoalCents)}</span>
        </label>
      </div>

      <div className="mt-6 border-t border-white/5 pt-6">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft">Custom Brand Identity</p>
        <p className="mt-1 text-xs text-zinc-500">Define the visual branding displayed across customer and admin dashboards.</p>
        
        <div className={`mt-4 grid gap-3 ${compact ? '' : 'sm:grid-cols-2'}`}>
          <label className="block text-xs">
            <span className="text-zinc-500">Branded Display Name (e.g. Gloss Boss ATX)</span>
            <input
              value={form.businessDisplayName ?? ''}
              onChange={(e) => setForm({ ...form, businessDisplayName: e.target.value })}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
              placeholder="e.g. Gloss Boss ATX"
            />
          </label>
          <label className="block text-xs">
            <span className="text-zinc-500">Brand Short Name (e.g. Gloss Boss)</span>
            <input
              value={form.brandShortName ?? ''}
              onChange={(e) => setForm({ ...form, brandShortName: e.target.value })}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
              placeholder="e.g. Gloss Boss"
            />
          </label>
          <label className="block text-xs">
            <span className="text-zinc-500">Legal Business Name</span>
            <input
              value={form.legalBusinessName ?? ''}
              onChange={(e) => setForm({ ...form, legalBusinessName: e.target.value })}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
              placeholder="e.g. Gloss Boss ATX LLC"
            />
          </label>
          <label className="block text-xs">
            <span className="text-zinc-500">Brand City Label (e.g. Austin, TX)</span>
            <input
              value={form.brandCityLabel ?? ''}
              onChange={(e) => setForm({ ...form, brandCityLabel: e.target.value })}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
              placeholder="e.g. Austin, TX"
            />
          </label>
          
          {/* Logo file upload */}
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <span className="text-xs font-bold text-white block mb-2">Workspace Logo File</span>
            <div className="flex items-center gap-4">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="Logo preview" className="h-12 w-12 rounded object-contain bg-zinc-900 border border-white/10 p-1" />
              ) : (
                <div className="h-12 w-12 rounded bg-zinc-950 border border-dashed border-white/20 flex items-center justify-center text-[10px] text-zinc-600">No Logo</div>
              )}
              <div className="flex-1">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gold/30 bg-gold/5 px-3 py-1.5 text-xs text-gold-soft hover:bg-gold/15 transition duration-200">
                  {logoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  <span>{logoUploading ? 'Uploading...' : 'Upload Logo'}</span>
                  <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'logo_url')} className="hidden" disabled={logoUploading} />
                </label>
                <p className="mt-1 text-[10px] text-zinc-500">PNG, JPG, WebP or SVG. Max 3MB.</p>
              </div>
            </div>
          </div>

          {/* Favicon / Icon file upload */}
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <span className="text-xs font-bold text-white block mb-2">Favicon / Small Icon File</span>
            <div className="flex items-center gap-4">
              {form.iconUrl ? (
                <img src={form.iconUrl} alt="Icon preview" className="h-12 w-12 rounded object-contain bg-zinc-900 border border-white/10 p-1" />
              ) : (
                <div className="h-12 w-12 rounded bg-zinc-950 border border-dashed border-white/20 flex items-center justify-center text-[10px] text-zinc-600">No Icon</div>
              )}
              <div className="flex-1">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gold/30 bg-gold/5 px-3 py-1.5 text-xs text-gold-soft hover:bg-gold/15 transition duration-200">
                  {iconUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  <span>{iconUploading ? 'Uploading...' : 'Upload Icon'}</span>
                  <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'icon_url')} className="hidden" disabled={iconUploading} />
                </label>
                <p className="mt-1 text-[10px] text-zinc-500">PNG, JPG, WebP or SVG. Max 1MB.</p>
              </div>
            </div>
          </div>

          <label className="block text-xs">
            <span className="text-zinc-500">Support Email (Client-facing)</span>
            <input
              value={form.supportEmail ?? ''}
              onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
              placeholder="e.g. support@glossbossatx.com"
            />
          </label>
          <label className="block text-xs">
            <span className="text-zinc-500">Support Phone (Client-facing)</span>
            <input
              value={form.supportPhone ?? ''}
              onChange={(e) => setForm({ ...form, supportPhone: e.target.value })}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
              placeholder="e.g. 512-555-0199"
            />
          </label>
          <label className="block text-xs">
            <span className="text-zinc-500">Website URL</span>
            <input
              value={form.websiteUrl ?? ''}
              onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
              placeholder="e.g. https://www.glossbossatx.com"
            />
          </label>
          <label className="block text-xs">
            <span className="text-zinc-500">Public Booking URL</span>
            <input
              value={form.publicBookingUrl ?? ''}
              onChange={(e) => setForm({ ...form, publicBookingUrl: e.target.value })}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
              placeholder="e.g. https://www.glossbossatx.com/book"
            />
          </label>
        </div>
      </div>

      {!compact ? (
        <div className="mt-6 border-t border-white/5 pt-6">
          <p className="text-[10px] font-black uppercase text-zinc-600">Operating hours</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {DAYS.map((day) => (
              <label key={day} className="text-xs">
                <span className="uppercase text-zinc-500">{day}</span>
                <input
                  value={form.operatingHours[day] ?? 'closed'}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      operatingHours: { ...form.operatingHours, [day]: e.target.value },
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black px-2 py-1.5 text-sm text-white"
                  placeholder="8-18 or closed"
                />
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/5 pt-4">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded-xl bg-gold px-5 py-2.5 text-[10px] font-black uppercase text-black disabled:opacity-50"
        >
          Save workspace DNA
        </button>
        {saved ? <span className="text-xs text-emerald-400">Saved — Titan will use these settings.</span> : null}
        {err ? <span className="text-xs text-red-300">{err}</span> : null}
      </div>
    </section>
  );
}
