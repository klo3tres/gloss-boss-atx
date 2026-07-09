'use client';

import { useState, useTransition } from 'react';
import { createBusinessOnboardingAction } from '@/app/(dashboard)/titan/actions';

const INDUSTRIES = [
  { value: 'mobile_detailing', label: 'Mobile detailing' },
  { value: 'pressure_washing', label: 'Pressure washing' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'cleaning', label: 'Cleaning services' },
  { value: 'web_agency', label: 'Web agency / growth' },
  { value: 'other', label: 'Other service business' },
];

export function TitanOnboardingStart({ hasBusiness }: { hasBusiness: boolean }) {
  const [step, setStep] = useState(hasBusiness ? 2 : 1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (hasBusiness && step >= 2) {
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
        <p className="text-[10px] font-black uppercase tracking-wider text-amber-400">Onboarding</p>
        <h2 className="mt-2 text-xl font-black text-white">Your Titan workspace is ready</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Connect integrations, create an API key for website leads, and review your first opportunities.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a href="/titan/connect" className="rounded-xl bg-amber-500 px-4 py-2 text-[10px] font-black uppercase text-black">
            Connect integrations
          </a>
          <a href="/titan/api-keys" className="rounded-xl border border-white/15 px-4 py-2 text-[10px] font-black uppercase text-zinc-300">
            Create API key
          </a>
          <a href="/titan/opportunities" className="rounded-xl border border-white/15 px-4 py-2 text-[10px] font-black uppercase text-zinc-300">
            View opportunities
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
      <p className="text-[10px] font-black uppercase tracking-wider text-amber-400">Start with Titan</p>
      <h2 className="mt-2 text-xl font-black text-white">Create your business workspace</h2>
      <p className="mt-2 text-sm text-zinc-400">
        Titan is an AI business operating system — CRM, lead capture, follow-ups, integrations, and revenue actions.
      </p>

      <form
        className="mt-6 grid gap-4 sm:grid-cols-2"
        action={(fd) => {
          startTransition(async () => {
            setError(null);
            const res = await createBusinessOnboardingAction(fd);
            if (res.error) setError(res.error);
            else window.location.href = '/titan/connect';
          });
        }}
      >
        <label className="block text-xs text-zinc-400 sm:col-span-2">
          Business name
          <input
            name="name"
            required
            className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white"
            placeholder="Flash Growth LLC"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          URL slug
          <input
            name="slug"
            required
            pattern="[a-z0-9-]+"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white"
            placeholder="flash-growth"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Industry
          <select name="industry" className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white">
            {INDUSTRIES.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-zinc-400 sm:col-span-2">
          Website (optional)
          <input
            name="website_url"
            type="url"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white"
            placeholder="https://example.com"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="sm:col-span-2 rounded-xl bg-amber-500 px-4 py-3 text-[10px] font-black uppercase text-black disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create workspace'}
        </button>
      </form>
      {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
