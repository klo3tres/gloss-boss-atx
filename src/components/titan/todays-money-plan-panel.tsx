'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TodaysMoneyPlan, MoneyMission } from '@/lib/titan/todays-money-plan';
import { formatMissionRevenue } from '@/lib/titan/todays-money-plan';
import { useOutboundPreview } from '@/components/admin/outbound-message-provider';
import { buildToneVariants } from '@/lib/outbound-message-tones';
import { markOpportunityStatusAction } from '@/app/(dashboard)/admin/titan/opportunity-actions';
import { sendPreviewedSmsAction } from '@/app/(dashboard)/admin/outbound-message-actions';

function MissionCard({ mission }: { mission: MoneyMission }) {
  const router = useRouter();
  const { openPreview } = useOutboundPreview();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(mission.status);
  const [result, setResult] = useState('');

  return (
    <article className="rounded-2xl border border-emerald-500/20 bg-black/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase text-emerald-300">{mission.missionKey.replace(/_/g, ' ')}</p>
          <h3 className="mt-1 text-sm font-black text-white">{mission.title}</h3>
        </div>
        <p className="font-mono text-sm font-black text-gold-soft">{formatMissionRevenue(mission)}</p>
      </div>
      <p className="mt-2 text-xs text-zinc-400">{mission.description}</p>
      <p className="mt-2 text-[10px] text-zinc-600">
        {mission.confidenceScore}% confidence · {mission.confidenceLabel} · effort: {mission.effortLevel}
      </p>
      <p className="mt-3 rounded-xl border border-white/6 bg-white/5 p-3 text-xs italic text-zinc-300">{mission.script}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !mission.contactPhone}
          onClick={() => {
            if (!mission.contactPhone) return;
            const tones = buildToneVariants(mission.script);
            openPreview({
              title: 'Send mission SMS',
              channel: 'sms',
              recipient: mission.contactPhone,
              body: tones.professional,
              toneVariants: tones,
              contextLabel: mission.title,
              onSend: async (final) => {
                const res = await sendPreviewedSmsAction({
                  to: mission.contactPhone!,
                  body: final.body,
                  kind: `money_mission_${mission.missionKey}`,
                  entityType: mission.entityType,
                  entityId: mission.entityId,
                });
                if (!res.error && mission.entityType === 'opportunity' && mission.entityId) {
                  await markOpportunityStatusAction(mission.entityId, 'contacted');
                }
                if (!res.error) router.refresh();
                return res;
              },
            });
          }}
          className="rounded-lg bg-gold px-3 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50"
        >
          {mission.contactPhone ? 'Preview & send SMS' : 'No phone on file'}
        </button>
        <Link href={mission.href} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-white">
          Start
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(() => {
              setStatus('done');
              setResult('Logged — nice work.');
            });
          }}
          className="rounded-lg border border-emerald-500/30 px-3 py-2 text-[10px] font-black uppercase text-emerald-200"
        >
          Mark done
        </button>
      </div>
      {result ? <p className="mt-2 text-[11px] text-emerald-300">{result}</p> : null}
      {status === 'done' ? <p className="mt-1 text-[10px] text-zinc-600">Completed</p> : null}
    </article>
  );
}

export function TodaysMoneyPlanPanel({ plan }: { plan: TodaysMoneyPlan }) {
  const pct = plan.goalTarget > 0 ? Math.round((plan.goalProgress / plan.goalTarget) * 100) : 0;

  return (
    <section className="rounded-3xl border border-gold/25 bg-gradient-to-br from-gold/10 via-black to-zinc-950 p-5 sm:p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-gold-soft">Today&apos;s money plan</p>
      <h2 className="mt-2 text-xl font-black text-white sm:text-2xl">{plan.goalLabel}</h2>
      <div className="mt-4">
        <div className="flex justify-between text-xs text-zinc-400">
          <span>{plan.goalProgress} of {plan.goalTarget} booked (24h)</span>
          <span>{pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {plan.territoryHint ? (
        <p className="mt-3 text-xs text-cyan-200">Territory focus: {plan.territoryHint}</p>
      ) : null}
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {plan.missions.map((m) => (
          <MissionCard key={m.id} mission={m} />
        ))}
      </div>
    </section>
  );
}
