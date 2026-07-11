'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { TitanWorkspace } from '@/lib/titan/workspace';
import type { TitanSystemHealth } from '@/lib/titan/system-health';
import { TitanWorkspaceForm } from '@/components/admin/titan-workspace-form';
import { TitanSystemHealthPanel } from '@/components/titan/titan-system-health-panel';
import { saveTitanProductSettingsAction } from '@/app/(dashboard)/admin/titan/titan-settings-actions';
import { runTitanAutomationNowAction } from '@/app/(dashboard)/admin/titan/titan-settings-actions';
import { TITAN_RELEASE } from '@/lib/titan/branding';

export function TitanSettingsClient({
  workspace,
  health,
}: {
  workspace: TitanWorkspace & { tablesReady: boolean };
  health: TitanSystemHealth;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toggles, setToggles] = useState({
    publicWidgetEnabled: workspace.publicWidgetEnabled,
    operatorAssistantEnabled: workspace.operatorAssistantEnabled,
    poweredByBrandingEnabled: workspace.poweredByBrandingEnabled,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [runningJob, setRunningJob] = useState<string | null>(null);

  const saveToggles = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await saveTitanProductSettingsAction(toggles);
      if (res.error) setMsg(res.error);
      else {
        setMsg('Settings saved');
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-emerald-500/20 bg-zinc-950/50 p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-300">Automation controls</p>
        <p className="mt-2 text-xs text-zinc-500">Safe, idempotent jobs. Each run is locked, timed, and recorded below.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {([
            ['titan_nightly', 'Run Titan nightly'],
            ['process_follow_ups', 'Run follow-ups'],
            ['sync_exceptions', 'Sync exceptions'],
          ] as const).map(([jobKey, label]) => (
            <button
              key={jobKey}
              type="button"
              disabled={runningJob !== null}
              onClick={() => {
                setRunningJob(jobKey);
                setMsg(null);
                startTransition(async () => {
                  const result = await runTitanAutomationNowAction(jobKey);
                  setRunningJob(null);
                  setMsg(result.error ?? `${label} completed in ${result.durationMs ?? 0}ms`);
                  router.refresh();
                });
              }}
              className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-[10px] font-black uppercase text-emerald-200 disabled:opacity-40"
            >
              {runningJob === jobKey ? 'Runningâ€¦' : label}
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-3xl border border-white/8 bg-zinc-950/50 p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Titan feature toggles</p>
        <div className="mt-4 space-y-3">
          {[
            { key: 'publicWidgetEnabled' as const, label: 'Public Ask Titan widget', desc: 'Show on homepage & marketing pages' },
            { key: 'operatorAssistantEnabled' as const, label: 'Operator assistant', desc: 'Titan button on admin/tech routes' },
            { key: 'poweredByBrandingEnabled' as const, label: 'Powered by Titan™ branding', desc: 'Footer & assistant badges' },
          ].map((t) => (
            <label key={t.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/8 bg-black/40 p-4">
              <input
                type="checkbox"
                checked={toggles[t.key]}
                onChange={(e) => setToggles({ ...toggles, [t.key]: e.target.checked })}
                className="mt-1"
              />
              <span>
                <span className="text-sm font-bold text-white">{t.label}</span>
                <span className="mt-0.5 block text-xs text-zinc-500">{t.desc}</span>
              </span>
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={saveToggles}
          className="mt-4 rounded-xl bg-gold px-5 py-2.5 text-[10px] font-black uppercase text-black disabled:opacity-50"
        >
          Save toggles
        </button>
        {msg ? <p className="mt-2 text-xs text-emerald-400">{msg}</p> : null}
      </section>

      <TitanWorkspaceForm workspace={workspace} />
      <TitanSystemHealthPanel health={health} />
      <section className="rounded-3xl border border-white/8 bg-zinc-950/50 p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-soft">Patch notes Â· v{TITAN_RELEASE.version}</p>
        <p className="mt-2 text-xs text-zinc-500">Released {TITAN_RELEASE.releaseDate} Â· Migration {TITAN_RELEASE.migration}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2"><div><p className="text-[10px] font-black uppercase text-emerald-300">Shipped workflows</p><ul className="mt-2 space-y-1 text-xs text-zinc-300">{TITAN_RELEASE.shipped.map((item) => <li key={item}>Â· {item}</li>)}</ul></div><div><p className="text-[10px] font-black uppercase text-amber-300">Known blockers</p><ul className="mt-2 space-y-1 text-xs text-zinc-400">{TITAN_RELEASE.knownBlockers.map((item) => <li key={item}>Â· {item}</li>)}</ul></div></div>
        <p className="mt-4 text-[10px] text-zinc-500">QA: {TITAN_RELEASE.qaStatus}</p>
        <p className="mt-1 text-[10px] text-zinc-600">Rollback: {TITAN_RELEASE.rollback}</p>
      </section>
    </div>
  );
}
