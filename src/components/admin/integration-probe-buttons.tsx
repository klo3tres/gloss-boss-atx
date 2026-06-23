'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { runIntegrationProbeAction } from '@/app/(dashboard)/admin/integrations/maps-integration-actions';
import type { IntegrationTestKind } from '@/lib/integrations/integration-tests';
import type { IntegrationConnectionStatus } from '@/lib/integrations/maps-discovery-status';

const STATUS_LABEL: Record<IntegrationConnectionStatus, string> = {
  connected: 'Connected',
  missing: 'Missing',
  invalid_key: 'Invalid key',
  billing_not_enabled: 'Billing not enabled',
  api_not_enabled: 'API not enabled',
  manual: 'Manual / list-only',
};

const STATUS_CLASS: Record<IntegrationConnectionStatus, string> = {
  connected: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  missing: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  invalid_key: 'text-red-300 border-red-500/30 bg-red-500/10',
  billing_not_enabled: 'text-orange-300 border-orange-500/30 bg-orange-500/10',
  api_not_enabled: 'text-orange-300 border-orange-500/30 bg-orange-500/10',
  manual: 'text-blue-300 border-blue-500/30 bg-blue-500/10',
};

const TESTS: { kind: IntegrationTestKind; label: string }[] = [
  { kind: 'google_places', label: 'Google Places' },
  { kind: 'google_maps', label: 'Google Maps' },
  { kind: 'apple_mapkit', label: 'Apple MapKit' },
  { kind: 'openweather', label: 'OpenWeather' },
  { kind: 'twilio', label: 'Twilio' },
  { kind: 'resend', label: 'Resend' },
  { kind: 'stripe', label: 'Stripe' },
];

export function IntegrationProbeButtons() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [results, setResults] = useState<Record<string, { status: IntegrationConnectionStatus; detail: string }>>({});

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">Test integration</p>
      <div className="flex flex-wrap gap-2">
        {TESTS.map((t) => (
          <button
            key={t.kind}
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await runIntegrationProbeAction(t.kind);
                setResults((prev) => ({ ...prev, [t.kind]: { status: res.status, detail: res.detail } }));
                router.refresh();
              })
            }
            className="rounded-lg border border-white/10 bg-black px-3 py-1.5 text-[10px] font-black uppercase text-zinc-300 hover:border-gold/30 disabled:opacity-50"
          >
            {t.label}
          </button>
        ))}
      </div>
      {Object.entries(results).map(([kind, r]) => (
        <div key={kind} className={`rounded-xl border px-3 py-2 text-xs ${STATUS_CLASS[r.status]}`}>
          <span className="font-black uppercase">{TESTS.find((t) => t.kind === kind)?.label ?? kind}: </span>
          <span>{STATUS_LABEL[r.status]}</span>
          <span className="text-zinc-400"> — {r.detail}</span>
        </div>
      ))}
    </div>
  );
}
