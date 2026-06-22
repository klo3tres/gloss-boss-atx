'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveTitanWorkspaceAction } from '@/app/(dashboard)/admin/super/titan-workspace-actions';
import type { TitanWorkspace, TitanIndustry } from '@/lib/titan/workspace';
import { INDUSTRY_LABELS } from '@/lib/titan/workspace';
import { displayMoney } from '@/lib/display-format';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function TitanWorkspaceForm({ workspace, compact = false }: { workspace: TitanWorkspace; compact?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(workspace);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
          <span className="text-zinc-500">Business name</span>
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
      {!compact ? (
        <div className="mt-4">
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
      <div className="mt-4 flex flex-wrap items-center gap-3">
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
