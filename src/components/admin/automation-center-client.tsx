'use client';

import { useState } from 'react';
import { CloudSun, Play, ShieldCheck } from 'lucide-react';
import { MANUAL_AUTOMATIONS, type ManualAutomationKey } from '@/lib/admin/manual-automation-definitions';

type RunState = { kind: 'success' | 'error'; message: string } | null;

function summarize(value: unknown): string {
  if (!value || typeof value !== 'object') return 'Run completed.';
  const row = value as Record<string, unknown>;
  if (row.error) return String(row.error);
  const result = row.result && typeof row.result === 'object' ? (row.result as Record<string, unknown>) : row;
  const useful = Object.entries(result)
    .filter(([, item]) => ['string', 'number', 'boolean'].includes(typeof item))
    .slice(0, 5)
    .map(([key, item]) => `${key.replaceAll('_', ' ')}: ${String(item)}`);
  return useful.length ? useful.join(' · ') : 'Run completed.';
}

export function AutomationCenterClient() {
  const [running, setRunning] = useState<ManualAutomationKey | null>(null);
  const [states, setStates] = useState<Partial<Record<ManualAutomationKey, RunState>>>({});
  const [weatherSettings, setWeatherSettings] = useState<Record<string, unknown> | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);

  async function openWeatherSettings() {
    if (weatherSettings) return;
    const response = await fetch('/api/admin/automation/weather-settings');
    if (response.ok) setWeatherSettings((await response.json()) as Record<string, unknown>);
  }

  async function saveWeatherSettings() {
    if (!weatherSettings) return;
    setSettingsBusy(true);
    const response = await fetch('/api/admin/automation/weather-settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(weatherSettings),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (response.ok && payload.settings) setWeatherSettings(payload.settings as Record<string, unknown>);
    setSettingsBusy(false);
  }

  async function run(key: ManualAutomationKey) {
    if (running) return;
    setRunning(key);
    setStates((current) => ({ ...current, [key]: null }));
    try {
      const response = await fetch(`/api/admin/automation/run/${key}`, { method: 'POST' });
      const payload = (await response.json()) as Record<string, unknown>;
      setStates((current) => ({
        ...current,
        [key]: { kind: response.ok ? 'success' : 'error', message: summarize(payload) },
      }));
    } catch (error) {
      setStates((current) => ({
        ...current,
        [key]: { kind: 'error', message: error instanceof Error ? error.message : 'Run failed.' },
      }));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-amber-400/25 bg-amber-400/5 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div>
            <h2 className="font-black text-foreground">Temporary manual scheduling</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Vercel Hobby does not permit frequent cron schedules. The engines remain intact and can be run here by an owner until a dedicated scheduler or Vercel Pro is connected.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {MANUAL_AUTOMATIONS.map((automation) => {
          const state = states[automation.key];
          const isWeather = automation.key === 'weather_campaign_engine';
          return (
            <article key={automation.key} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    {isWeather ? <CloudSun className="h-4 w-4 text-cyan-300" /> : null}
                    <h3 className="text-sm font-black text-foreground">{automation.label}</h3>
                  </div>
                  <p className="mt-2 min-h-10 text-xs leading-5 text-muted-foreground">{automation.description}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={Boolean(running)}
                onClick={() => void run(automation.key)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-3 py-2 text-[11px] font-black uppercase tracking-wide text-black disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" />
                {running === automation.key ? 'Running…' : isWeather ? 'Create weather draft' : 'Run now'}
              </button>
              {state ? (
                <p className={`mt-3 text-xs ${state.kind === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>{state.message}</p>
              ) : null}
            </article>
          );
        })}
      </section>

      <section className="rounded-3xl border border-cyan-400/20 bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-black text-foreground">Weather campaign safety</h2>
            <p className="mt-1 text-xs text-muted-foreground">Drafting is allowed; sending stays owner-controlled. Opt-outs, cooldowns, capacity, and deep-clean exclusions are enforced by the draft engine.</p>
          </div>
          <button type="button" onClick={() => void openWeatherSettings()} className="rounded-xl border border-border px-3 py-2 text-xs font-black text-foreground">
            {weatherSettings ? 'Settings loaded' : 'Manage settings'}
          </button>
        </div>
        {weatherSettings ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['recommendationsEnabled', 'Weather recommendations'],
              ['autoDraftEnabled', 'Automatic draft creation'],
              ['requireOwnerApproval', 'Require owner approval'],
              ['autoSendEnabled', 'Automatic sending'],
              ['manualPollenSpike', 'Pollen spike active'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-xs font-bold text-foreground">
                {label}
                <input type="checkbox" checked={weatherSettings[key] === true} onChange={(event) => setWeatherSettings({ ...weatherSettings, [key]: event.target.checked })} />
              </label>
            ))}
            {[
              ['minimumHoursAfterRain', 'Hours after rain', 0, 72],
              ['minimumRainyDays', 'Rainy-day threshold', 1, 7],
              ['maxCampaignsPerWeek', 'Maximum per week', 1, 7],
              ['cooldownDays', 'Customer cooldown days', 1, 90],
              ['minimumOpenCapacity', 'Minimum open capacity', 1, 25],
              ['maxMessages', 'Maximum messages', 1, 500],
            ].map(([key, label, min, max]) => (
              <label key={String(key)} className="grid gap-2 text-xs font-bold text-muted-foreground">
                {label}
                <input type="number" min={Number(min)} max={Number(max)} value={Number(weatherSettings[String(key)] ?? 0)} onChange={(event) => setWeatherSettings({ ...weatherSettings, [String(key)]: Number(event.target.value) })} className="rounded-xl border border-border bg-background px-3 py-2 text-foreground" />
              </label>
            ))}
            <label className="grid gap-2 text-xs font-bold text-muted-foreground">Quiet hours start<input type="time" value={String(weatherSettings.quietHoursStart ?? '20:00')} onChange={(event) => setWeatherSettings({ ...weatherSettings, quietHoursStart: event.target.value })} className="rounded-xl border border-border bg-background px-3 py-2 text-foreground" /></label>
            <label className="grid gap-2 text-xs font-bold text-muted-foreground">Quiet hours end<input type="time" value={String(weatherSettings.quietHoursEnd ?? '08:00')} onChange={(event) => setWeatherSettings({ ...weatherSettings, quietHoursEnd: event.target.value })} className="rounded-xl border border-border bg-background px-3 py-2 text-foreground" /></label>
            <label className="grid gap-2 text-xs font-bold text-muted-foreground md:col-span-2">Eligible service areas<input value={Array.isArray(weatherSettings.eligibleServiceAreas) ? weatherSettings.eligibleServiceAreas.join(', ') : ''} onChange={(event) => setWeatherSettings({ ...weatherSettings, eligibleServiceAreas: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} className="rounded-xl border border-border bg-background px-3 py-2 text-foreground" /></label>
            <label className="grid gap-2 text-xs font-bold text-muted-foreground">Default promotion<input value={String(weatherSettings.defaultPromotion ?? '')} onChange={(event) => setWeatherSettings({ ...weatherSettings, defaultPromotion: event.target.value })} className="rounded-xl border border-border bg-background px-3 py-2 text-foreground" /></label>
            <label className="grid gap-2 text-xs font-bold text-muted-foreground">Promotion stacking<select value={String(weatherSettings.promoStacking ?? 'blocked')} onChange={(event) => setWeatherSettings({ ...weatherSettings, promoStacking: event.target.value })} className="rounded-xl border border-border bg-background px-3 py-2 text-foreground"><option value="blocked">Blocked</option><option value="allowed">Allowed</option></select></label>
            <div className="md:col-span-2 xl:col-span-4 flex items-center gap-3">
              <button type="button" disabled={settingsBusy} onClick={() => void saveWeatherSettings()} className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-black text-black disabled:opacity-50">{settingsBusy ? 'Saving…' : 'Save weather settings'}</button>
              {weatherSettings.autoSendEnabled === true && weatherSettings.requireOwnerApproval === true ? <p className="text-xs text-amber-300">Turn off owner approval before automatic sending can be enabled.</p> : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
