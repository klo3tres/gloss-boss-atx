import Link from 'next/link';
import { TITAN_ENGINES } from '@/lib/titan/branding';

const STEPS = [
  { n: 1, title: 'Set monthly goal', href: '/admin/goals', detail: 'Titan works backward from your revenue target.' },
  { n: 2, title: "Check today's top 3 actions", href: '#daily-manager', detail: 'Real follow-ups, estimates, reviews — not filler.' },
  { n: 3, title: 'Open action → review message', href: '#daily-manager', detail: 'Every outreach opens in a modal before copy/send.' },
  { n: 4, title: 'Log outcome', href: '#daily-manager', detail: 'Replied, booked, declined — Titan learns from this.' },
  { n: 5, title: 'Schedule follow-up', href: '#daily-manager', detail: 'Day 2 and day 4 cadence if no response.' },
  { n: 6, title: 'Check proof / attribution', href: '#proof', detail: 'See revenue Titan connected to your actions.' },
];

const TOOLTIPS: { label: string; explain: string }[] = [
  { label: TITAN_ENGINES.dailyAutonomy, explain: 'Your morning briefing — 3 highest-ROI actions with exact messages.' },
  { label: TITAN_ENGINES.outreach, explain: 'Copy-ready SMS, email, and social — manual send until Twilio is connected.' },
  { label: TITAN_ENGINES.dealRoom, explain: 'Pipeline from prospects — status, last touch, next step.' },
  { label: TITAN_ENGINES.recovery, explain: 'Money sitting in follow-ups, estimates, and lapsed customers.' },
  { label: TITAN_ENGINES.attribution, explain: 'Closed-loop proof — bookings/payments linked to your outreach.' },
];

export function TitanStartHere() {
  return (
    <section className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 to-black p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-300">Start here</p>
      <h2 className="mt-2 text-xl font-black text-white">How to use Titan in 6 steps</h2>
      <ol className="mt-4 space-y-3">
        {STEPS.map((s) => (
          <li key={s.n} className="flex gap-3 text-sm">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-black text-emerald-200">
              {s.n}
            </span>
            <div className="min-w-0">
              <Link href={s.href} className="font-bold text-white hover:text-emerald-200">
                {s.title}
              </Link>
              <p className="text-xs text-zinc-500">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <details className="mt-5 border-t border-white/8 pt-4">
        <summary className="cursor-pointer text-[10px] font-black uppercase text-zinc-500">What each module does</summary>
        <ul className="mt-3 space-y-2">
          {TOOLTIPS.map((t) => (
            <li key={t.label} className="text-xs">
              <span className="font-bold text-emerald-200/90">{t.label}</span>
              <span className="text-zinc-500"> — {t.explain}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
