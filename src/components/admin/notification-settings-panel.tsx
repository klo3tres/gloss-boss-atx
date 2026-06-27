'use client';

import { useState, useTransition } from 'react';
import type { OwnerNotificationPreferences } from '@/lib/titan/notification-preferences';
import type { ScanFrequency } from '@/lib/titan/scan-budget';
import { frequencyLabel } from '@/lib/titan/scan-budget';
import { saveNotificationPreferencesAction } from '@/app/(dashboard)/admin/notifications/titan-notification-actions';
import { useToast } from '@/components/ui/toast-provider';

const FREQ_OPTIONS: ScanFrequency[] = ['manual', 'on_login', 'twice_daily', 'four_times_daily', 'hourly'];

export function NotificationSettingsPanel({ prefs }: { prefs: OwnerNotificationPreferences }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState(prefs);
  const [hourlyConfirm, setHourlyConfirm] = useState(false);

  const toggle = (key: keyof OwnerNotificationPreferences) => {
    if (typeof state[key] === 'boolean') {
      setState((s) => ({ ...s, [key]: !s[key] }));
    }
  };

  const save = () => {
    startTransition(async () => {
      const res = await saveNotificationPreferencesAction({
        notifyEmailEnabled: state.notifyEmailEnabled,
        notifySmsEnabled: state.notifySmsEnabled,
        notifyPushoverEnabled: state.notifyPushoverEnabled,
        notifyBookings: state.notifyBookings,
        notifyPayments: state.notifyPayments,
        notifyLeads: state.notifyLeads,
        notifyWeather: state.notifyWeather,
        notifyInventory: state.notifyInventory,
        quietHoursStart: state.quietHoursStart ?? '',
        quietHoursEnd: state.quietHoursEnd ?? '',
        leadRadarAutoScanEnabled: state.leadRadarAutoScanEnabled,
        googlePlacesScanFrequency: state.googlePlacesScanFrequency,
        maxPlacesRequestsPerDay: state.maxPlacesRequestsPerDay,
      });
      if (res.error) toast.error('Could not save', res.error);
      else toast.success('Settings saved', 'Alert preferences updated.');
    });
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/45 p-5 space-y-5">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Alert channels</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            ['notifyEmailEnabled', 'Email alerts'],
            ['notifySmsEnabled', 'SMS alerts'],
            ['notifyPushoverEnabled', 'Pushover alerts'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/40 px-3 py-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={Boolean(state[key as keyof OwnerNotificationPreferences])}
                onChange={() => toggle(key as keyof OwnerNotificationPreferences)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Notify me for</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            ['notifyBookings', 'Bookings & work orders'],
            ['notifyPayments', 'Payments'],
            ['notifyLeads', 'Leads & quotes'],
            ['notifyWeather', 'Weather risks'],
            ['notifyInventory', 'Low inventory'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={Boolean(state[key as keyof OwnerNotificationPreferences])}
                onChange={() => toggle(key as keyof OwnerNotificationPreferences)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-zinc-400">
          Quiet hours start
          <input
            type="time"
            value={state.quietHoursStart ?? ''}
            onChange={(e) => setState((s) => ({ ...s, quietHoursStart: e.target.value || null }))}
            className="mt-1 block w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="text-xs text-zinc-400">
          Quiet hours end
          <input
            type="time"
            value={state.quietHoursEnd ?? ''}
            onChange={(e) => setState((s) => ({ ...s, quietHoursEnd: e.target.value || null }))}
            className="mt-1 block w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
          />
        </label>
      </div>

      <div className="border-t border-white/8 pt-4">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Lead Radar scan</p>
        <label className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={state.leadRadarAutoScanEnabled}
            onChange={() => setState((s) => ({ ...s, leadRadarAutoScanEnabled: !s.leadRadarAutoScanEnabled }))}
          />
          Enable automatic scans (respects daily budget)
        </label>
        <label className="mt-3 block text-xs text-zinc-400">
          Scan frequency
          <select
            value={state.googlePlacesScanFrequency}
            onChange={(e) => {
              const v = e.target.value as ScanFrequency;
              if (v === 'hourly' && !hourlyConfirm) {
                const ok = window.confirm('Hourly scans use more Google Places API credits. Continue?');
                if (!ok) return;
                setHourlyConfirm(true);
              }
              setState((s) => ({ ...s, googlePlacesScanFrequency: v }));
            }}
            className="mt-1 block w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
          >
            {FREQ_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {frequencyLabel(f)}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-xs text-zinc-400">
          Daily Google Places limit
          <input
            type="number"
            min={5}
            max={200}
            value={state.maxPlacesRequestsPerDay}
            onChange={(e) => setState((s) => ({ ...s, maxPlacesRequestsPerDay: Number(e.target.value) || 25 }))}
            className="mt-1 block w-full max-w-xs rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white"
          />
        </label>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="rounded-xl bg-gold px-5 py-2.5 text-[10px] font-black uppercase text-black disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save notification settings'}
      </button>
    </div>
  );
}
