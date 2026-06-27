'use client';

import { TitanPageGuide, TITAN_GUIDES } from '@/components/titan/titan-page-guide';

const QA_ITEMS = [
  'Homepage loads without redirect loop',
  'Services page loads and CTAs work',
  'Booking completes (test mode OK)',
  'Member discount applies when logged in as member',
  'Customer dashboard loads',
  'Owner dashboard + Titan home load',
  'Lead Radar capture modal works',
  'Opportunity Board SMS test (or copy fallback)',
  'Google Calendar connect + pull sync',
  'Weather shows correct day on calendar',
  'Inventory page loads',
  'Analytics tag in page source (G-VWFWQ0P9GB)',
  'Clarity tag in page source',
];

export function PostDeployQaChecklist() {
  return (
    <section className="mt-6 rounded-3xl border border-white/10 bg-black/55 p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Post-deploy QA checklist</p>
      <p className="mt-1 text-xs text-zinc-500">Run after every production push.</p>
      <ul className="mt-4 space-y-2">
        {QA_ITEMS.map((item) => (
          <li key={item} className="flex items-start gap-2 text-xs text-zinc-300">
            <input type="checkbox" className="mt-0.5" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TitanOnboardingChecklistPanel() {
  return (
    <section className="mt-6 rounded-3xl border border-emerald-500/20 bg-black/55 p-6">
      <TitanPageGuide config={TITAN_GUIDES.setup} />
      <p className="mt-4 text-[10px] font-black uppercase text-emerald-300">Owner setup path</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-zinc-400">
        <li>Set owner profile</li>
        <li>Set brand settings + Media Studio hero</li>
        <li>Connect Stripe</li>
        <li>Connect Google Places + Calendar</li>
        <li>Connect Twilio + Resend</li>
        <li>Add first lead + run Lead Radar</li>
        <li>Add inventory + booking availability</li>
      </ol>
    </section>
  );
}
