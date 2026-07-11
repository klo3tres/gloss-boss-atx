import type { TitanSystemHealth } from '@/lib/titan/system-health';

function statusClass(status: string) {
  if (status === 'ok') return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
  if (status === 'manual') return 'text-amber-300 border-amber-500/30 bg-amber-500/10';
  if (status === 'missing') return 'text-red-300 border-red-500/30 bg-red-500/10';
  return 'text-zinc-400 border-white/10 bg-black/40';
}

export function TitanSystemHealthPanel({ health }: { health: TitanSystemHealth }) {
  const overallLabel =
    health.overall === 'healthy' ? 'Healthy' : health.overall === 'degraded' ? 'Degraded' : 'Critical';

  return (
    <section className="rounded-3xl border border-white/8 bg-zinc-950/50 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-300">Titan System Health</p>
          <p className="mt-1 text-sm text-zinc-500">
            Migration target <span className="font-mono text-zinc-400">{health.latestMigration}</span>
            {health.migrationReady ? ' · core tables active' : ' · apply pending migrations'}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${statusClass(health.overall === 'healthy' ? 'ok' : health.overall === 'degraded' ? 'manual' : 'missing')}`}
        >
          {overallLabel}
        </span>
      </div>

      {health.hobbyMode ? (
        <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-xs font-bold text-amber-100">{health.hobbyModeWarning}</p>
          <p className="mt-1 text-[10px] text-amber-200/80">
            Vercel crons run once daily. Use Run Now actions in admin for Lead Radar, exceptions, follow-ups, and Titan nightly.
          </p>
          <ul className="mt-3 space-y-1.5">
            {health.cronSchedules.map((c) => (
              <li key={c.id} className="text-[10px] text-amber-100/90">
                <span className="font-mono text-amber-200">{c.schedule}</span> · {c.label} · {c.manualHint}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-[10px] font-black uppercase text-zinc-600">Database tables</p>
          <ul className="mt-2 space-y-1.5">
            {health.tables.map((t) => (
              <li
                key={t.id}
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${statusClass(t.status)}`}
              >
                <span className="font-bold">{t.label}</span>
                <span className="text-[10px] opacity-80">{t.status === 'ok' ? 'OK' : t.detail}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase text-zinc-600">Integrations & keys</p>
          <ul className="mt-2 space-y-1.5">
            {health.integrations.map((i) => (
              <li
                key={i.id}
                className={`rounded-lg border px-3 py-2 text-xs ${statusClass(i.status)}`}
              >
                <p className="font-bold">{i.label}</p>
                <p className="mt-0.5 text-[10px] opacity-80">{i.detail}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[10px] text-zinc-600">
            Lead capture: {health.leadCaptureReady ? 'Ready (leads + service role)' : 'Blocked — check migrations & SUPABASE_SERVICE_ROLE_KEY'}
          </p>
        </div>
      </div>
      <div className="mt-5">
        <p className="text-[10px] font-black uppercase text-zinc-600">Latest automation runs</p>
        {health.automationRuns.length ? (
          <ul className="mt-2 grid gap-2 md:grid-cols-3">
            {health.automationRuns.map((run) => (
              <li key={run.jobKey} className={`rounded-xl border px-3 py-2 text-xs ${statusClass(run.status === 'completed' ? 'ok' : run.status === 'failed' ? 'missing' : 'manual')}`}>
                <p className="font-bold">{run.jobKey.replaceAll('_', ' ')}</p>
                <p className="mt-1 text-[10px] opacity-80">{run.status} Â· {run.durationMs ?? 0}ms Â· {new Date(run.startedAt).toLocaleString()}</p>
                {run.error ? <p className="mt-1 text-[10px]">{run.error}</p> : null}
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-xs text-amber-300">No recorded automation run yet. Apply migration 000127, then use Run Now.</p>}
      </div>
    </section>
  );
}
