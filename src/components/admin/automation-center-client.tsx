'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, CheckCircle2, Clock3, Mail, MessageSquare, Play, ShieldCheck, Users, X } from 'lucide-react';
import {
  MANUAL_AUTOMATIONS,
  type AutomationPreview,
  type ManualAutomationKey,
} from '@/lib/admin/manual-automation-definitions';

type RunState = { kind: 'success' | 'error'; message: string } | null;

function dateLabel(value: string | null) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' }).format(new Date(value));
}

function summarize(value: unknown): string {
  if (!value || typeof value !== 'object') return 'Completed.';
  const row = value as Record<string, unknown>;
  if (row.error) return String(row.error);
  const result = row.result && typeof row.result === 'object' ? row.result as Record<string, unknown> : row;
  const useful = Object.entries(result).filter(([, item]) => ['string', 'number', 'boolean'].includes(typeof item)).slice(0, 6).map(([key, item]) => `${key.replaceAll('_', ' ')}: ${String(item)}`);
  return useful.length ? useful.join(' · ') : 'Completed.';
}

function modeLabel(mode: string) {
  if (mode === 'draft_only') return 'Draft only';
  if (mode === 'automatic') return 'Automatic sending enabled';
  return 'Owner approval required';
}

export function AutomationCenterClient() {
  const [previews, setPreviews] = useState<AutomationPreview[]>([]);
  const [selectedKey, setSelectedKey] = useState<ManualAutomationKey | null>(null);
  const [running, setRunning] = useState<ManualAutomationKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [states, setStates] = useState<Partial<Record<ManualAutomationKey, RunState>>>({});
  const [tone, setTone] = useState<'quick' | 'professional' | 'warm'>('professional');
  const [weatherSettings, setWeatherSettings] = useState<Record<string, unknown> | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);

  async function refreshOverview() {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/automation/overview', { cache: 'no-store' });
      const payload = await response.json() as { previews?: AutomationPreview[] };
      setPreviews(payload.previews ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refreshOverview(); }, []);
  useEffect(() => {
    if (!selectedKey) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setSelectedKey(null);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [selectedKey]);

  const selectedDefinition = useMemo(() => MANUAL_AUTOMATIONS.find((item) => item.key === selectedKey) ?? null, [selectedKey]);
  const selectedPreview = useMemo(() => previews.find((item) => item.key === selectedKey) ?? null, [previews, selectedKey]);

  async function run(key: ManualAutomationKey) {
    if (running) return;
    setRunning(key);
    setStates((current) => ({ ...current, [key]: null }));
    try {
      const response = await fetch(`/api/admin/automation/run/${key}`, { method: 'POST' });
      const payload = await response.json() as Record<string, unknown>;
      setStates((current) => ({ ...current, [key]: { kind: response.ok ? 'success' : 'error', message: summarize(payload) } }));
      if (response.ok) await refreshOverview();
    } catch (error) {
      setStates((current) => ({ ...current, [key]: { kind: 'error', message: error instanceof Error ? error.message : 'Action failed.' } }));
    } finally {
      setRunning(null);
    }
  }

  async function openWeatherSettings() {
    if (weatherSettings) return;
    const response = await fetch('/api/admin/automation/weather-settings');
    if (response.ok) setWeatherSettings(await response.json() as Record<string, unknown>);
  }

  async function saveWeatherSettings() {
    if (!weatherSettings) return;
    setSettingsBusy(true);
    const response = await fetch('/api/admin/automation/weather-settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(weatherSettings) });
    const payload = await response.json() as Record<string, unknown>;
    if (response.ok && payload.settings) setWeatherSettings(payload.settings as Record<string, unknown>);
    setSettingsBusy(false);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-emerald-400/25 bg-emerald-400/5 p-5">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-300" /><div><h2 className="font-black text-foreground">Safe manual scheduling for Vercel Hobby</h2><p className="mt-1 max-w-4xl text-sm text-muted-foreground">Scans and drafts run on demand without consuming additional cron schedules. Customer outreach never sends from a scan. Open the preview to see exact recipients, exclusions, channels, and copy before approving any delivery.</p></div></div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {MANUAL_AUTOMATIONS.map((automation) => {
          const preview = previews.find((item) => item.key === automation.key);
          const state = states[automation.key];
          return <article key={automation.key} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black text-foreground">{automation.label}</h3><p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{automation.purpose}</p></div><span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black uppercase text-amber-300">{modeLabel(automation.mode)}</span></div>
            <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
              <div><dt className="font-black text-foreground">Trigger</dt><dd className="mt-1 text-muted-foreground">{automation.trigger}</dd></div>
              <div><dt className="font-black text-foreground">Records scanned</dt><dd className="mt-1 text-muted-foreground">{automation.recordsScanned}</dd></div>
              <div><dt className="font-black text-foreground">What this action does</dt><dd className="mt-1 text-muted-foreground">{automation.draftsOnly ? 'Creates or previews drafts only. It does not contact customers.' : automation.canContactCustomers ? 'Can contact customers only after owner confirmation.' : 'Internal records or staff alerts only.'}</dd></div>
              <div><dt className="font-black text-foreground">Channels</dt><dd className="mt-1 text-muted-foreground">{automation.channels.join(', ')}</dd></div>
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-xl border border-border p-3"><Users className="h-3.5 w-3.5 text-emerald-300"/><p className="mt-2 text-lg font-black">{loading ? '…' : preview?.eligibleCount ?? 0}</p><p className="text-[10px] uppercase text-muted-foreground">Eligible</p></div><div className="rounded-xl border border-border p-3"><Ban className="h-3.5 w-3.5 text-rose-300"/><p className="mt-2 text-lg font-black">{loading ? '…' : preview?.blockedCount ?? 0}</p><p className="text-[10px] uppercase text-muted-foreground">Blocked</p></div><div className="rounded-xl border border-border p-3 sm:col-span-2"><Clock3 className="h-3.5 w-3.5 text-sky-300"/><p className="mt-2 font-bold text-foreground">{dateLabel(preview?.lastRunAt ?? null)}</p><p className="text-[10px] uppercase text-muted-foreground">Last run · {preview?.lastResult ?? 'Loading'}</p></div></div>
            <div className="mt-4"><p className="text-[10px] font-black uppercase text-muted-foreground">Current safeguards</p><div className="mt-2 flex flex-wrap gap-1.5">{automation.safeguards.map((item) => <span key={item} className="rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">{item}</span>)}</div></div>
            <p className="mt-3 text-[10px] text-muted-foreground"><strong className="text-foreground">Next suggested run:</strong> {preview?.nextSuggestedRun ?? 'Calculating…'}</p>
            <button type="button" onClick={() => { setTone('professional'); setSelectedKey(automation.key); }} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-3 py-2 text-[11px] font-black uppercase text-black"><Play className="h-3.5 w-3.5" />{automation.actionLabel}</button>
            {state ? <p className={`mt-3 text-xs ${state.kind === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>{state.message}</p> : null}
          </article>;
        })}
      </section>

      <section className="rounded-3xl border border-cyan-400/20 bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black text-foreground">Weather campaign safety</h2><p className="mt-1 text-xs text-muted-foreground">Drafting is allowed; owner approval remains the default.</p></div><button type="button" onClick={() => void openWeatherSettings()} className="rounded-xl border border-border px-3 py-2 text-xs font-black">{weatherSettings ? 'Settings loaded' : 'Manage settings'}</button></div>{weatherSettings ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['recommendationsEnabled','Recommendations'],['autoDraftEnabled','Automatic drafts'],['requireOwnerApproval','Owner approval'],['autoSendEnabled','Automatic sending']].map(([key,label]) => <label key={key} className="flex items-center justify-between rounded-xl border border-border p-3 text-xs font-bold">{label}<input type="checkbox" checked={weatherSettings[key] === true} onChange={(event) => setWeatherSettings({ ...weatherSettings, [key]: event.target.checked })}/></label>)}<button type="button" disabled={settingsBusy} onClick={() => void saveWeatherSettings()} className="rounded-xl bg-cyan-400 px-3 py-2 text-xs font-black text-black disabled:opacity-50">{settingsBusy ? 'Saving…' : 'Save settings'}</button></div> : null}</section>

      {selectedKey && selectedDefinition && selectedPreview && typeof document !== 'undefined' ? createPortal(
        <div className="fixed inset-0 z-[200] flex justify-end bg-black/70" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setSelectedKey(null)}>
          <aside role="dialog" aria-modal="true" aria-label={`${selectedDefinition.label} preview`} className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-background p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Confirmation preview</p><h2 className="mt-1 text-2xl font-black">{selectedDefinition.label}</h2><p className="mt-2 text-sm text-muted-foreground">{selectedDefinition.purpose}</p></div><button type="button" onClick={() => setSelectedKey(null)} className="rounded-xl border border-border p-2" aria-label="Close preview"><X className="h-4 w-4" /></button></div>
            <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3"><p className="text-2xl font-black text-emerald-300">{selectedPreview.eligibleCount}</p><p className="text-xs text-muted-foreground">Eligible recipients</p></div><div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-3"><p className="text-2xl font-black text-rose-300">{selectedPreview.blockedCount}</p><p className="text-xs text-muted-foreground">Blocked with reasons</p></div></div>
            <div className="mt-5 flex gap-2">{(['quick','professional','warm'] as const).map((item) => <button key={item} type="button" onClick={() => setTone(item)} className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase ${tone === item ? 'bg-gold text-black' : 'border border-border text-muted-foreground'}`}>{item}</button>)}</div>
            <div className="mt-4 space-y-3">{selectedPreview.recipients.length ? selectedPreview.recipients.map((item) => <article key={item.id} className={`rounded-2xl border p-4 ${item.blockedReason ? 'border-rose-500/25 bg-rose-500/5' : 'border-border bg-card'}`}><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-black">{item.name}</h3><p className="mt-1 text-xs text-muted-foreground">{item.reason}</p></div><span className="rounded-full border border-border px-2 py-1 text-[10px] font-black uppercase">{item.channel}</span></div><div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">{item.phone ? <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{item.phone}</span> : null}{item.email ? <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{item.email}</span> : null}</div>{item.blockedReason ? <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">Blocked: {item.blockedReason}</p> : <div className="mt-3 rounded-xl border border-border bg-background p-3"><p className="text-[10px] font-black uppercase text-muted-foreground">{tone} customer-visible copy</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item[tone]}</p></div>}</article>) : <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No eligible records right now.</p>}</div>
            <div className="sticky bottom-0 mt-6 border-t border-border bg-background/95 py-4 backdrop-blur"><div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-200">{selectedDefinition.canContactCustomers ? 'This action will create or refresh drafts only. It will not send SMS or email. Approve individual messages from their preview before delivery.' : selectedKey === 'missed_job_start_alerts' ? 'This action sends internal staff alerts only; it does not contact customers.' : 'This action changes internal Titan records only.'}</div><div className="mt-3 flex gap-2"><button type="button" onClick={() => setSelectedKey(null)} className="flex-1 rounded-xl border border-border px-4 py-3 text-xs font-black uppercase">Cancel</button><button type="button" disabled={running === selectedKey} onClick={() => void run(selectedKey)} className="flex-1 rounded-xl bg-gold px-4 py-3 text-xs font-black uppercase text-black disabled:opacity-50">{running === selectedKey ? 'Working…' : selectedDefinition.draftsOnly ? 'Create drafts only' : selectedKey === 'missed_job_start_alerts' ? 'Confirm staff alerts' : 'Confirm action'}</button></div></div>
          </aside>
        </div>, document.body) : null}
    </div>
  );
}
