'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { INDUSTRY_LABELS, type TitanIndustry } from '@/lib/titan/workspace';
import { TITAN_ENGINES } from '@/lib/titan/branding';
import { saveOnboardingStepAction } from '@/app/(dashboard)/admin/titan/titan-1-actions';

const STEPS = [
  { title: 'Business', fields: ['businessName', 'industry'] },
  { title: 'Services & radius', fields: ['serviceRadiusMiles'] },
  { title: 'Revenue goal', fields: ['monthlyRevenueGoalCents'] },
  { title: 'Team', fields: ['employeeCount'] },
  { title: 'Integrations', fields: [] },
  { title: 'Launch', fields: [] },
];

export function TitanOnboardingClient({
  initialStep,
  initial,
}: {
  initialStep: number;
  initial: {
    businessName: string;
    industry: TitanIndustry;
    serviceRadiusMiles: number;
    monthlyRevenueGoalCents: number;
    employeeCount: number;
  };
}) {
  const router = useRouter();
  const [step, setStep] = useState(Math.max(0, initialStep));
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(initial);

  const save = (nextStep: number, complete?: boolean) => {
    startTransition(async () => {
      const res = await saveOnboardingStepAction({
        step: nextStep,
        businessName: form.businessName,
        industry: form.industry,
        serviceRadiusMiles: form.serviceRadiusMiles,
        monthlyRevenueGoalCents: form.monthlyRevenueGoalCents,
        employeeCount: form.employeeCount,
        complete,
      });
      if (!res.error) {
        if (complete) router.push('/admin/titan');
        else setStep(nextStep);
      }
    });
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-soft">{TITAN_ENGINES.onboarding}</p>
        <h1 className="mt-2 text-2xl font-black text-white">Set up Titan for your business</h1>
        <p className="mt-2 text-sm text-zinc-500">Step {step + 1} of {STEPS.length} — {STEPS[step]?.title}</p>
      </div>

      <div className="flex gap-1">
        {STEPS.map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded ${i <= step ? 'bg-gold-soft' : 'bg-white/10'}`} />
        ))}
      </div>

      <div className="rounded-3xl border border-white/10 bg-black/55 p-6 space-y-4">
        {step === 0 ? (
          <>
            <label className="block text-xs text-zinc-500">
              Business name
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white"
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Industry
              <select
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white"
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value as TitanIndustry })}
              >
                {Object.entries(INDUSTRY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        {step === 1 ? (
          <label className="block text-xs text-zinc-500">
            Service radius (miles)
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white"
              value={form.serviceRadiusMiles}
              onChange={(e) => setForm({ ...form, serviceRadiusMiles: Number(e.target.value) })}
            />
          </label>
        ) : null}

        {step === 2 ? (
          <label className="block text-xs text-zinc-500">
            Monthly revenue goal ($)
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white"
              value={form.monthlyRevenueGoalCents / 100}
              onChange={(e) => setForm({ ...form, monthlyRevenueGoalCents: Math.round(Number(e.target.value) * 100) })}
            />
          </label>
        ) : null}

        {step === 3 ? (
          <label className="block text-xs text-zinc-500">
            Team size
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white"
              value={form.employeeCount}
              onChange={(e) => setForm({ ...form, employeeCount: Number(e.target.value) })}
            />
          </label>
        ) : null}

        {step === 4 ? (
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>· Connect Stripe in Setup Center for payments</li>
            <li>· Add Twilio for SMS outreach</li>
            <li>· Enable Google Places for Lead Radar</li>
            <li>· Run migration 000096 for proof & learning tables</li>
          </ul>
        ) : null}

        {step === 5 ? (
          <div className="text-sm text-zinc-300">
            <p>Titan is configured for <strong>{form.businessName}</strong>.</p>
            <p className="mt-2 text-zinc-500">Goal: ${(form.monthlyRevenueGoalCents / 100).toFixed(0)}/mo · {form.serviceRadiusMiles}mi radius · {form.employeeCount} team</p>
          </div>
        ) : null}
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          disabled={step === 0 || pending}
          onClick={() => setStep(step - 1)}
          className="rounded-lg border border-white/10 px-4 py-2 text-xs text-zinc-400"
        >
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => save(step + 1)}
            className="rounded-lg bg-gold/20 px-4 py-2 text-xs font-black uppercase text-gold-soft"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => save(step, true)}
            className="rounded-lg bg-emerald-500/20 px-4 py-2 text-xs font-black uppercase text-emerald-200"
          >
            Launch Titan
          </button>
        )}
      </div>
    </div>
  );
}
