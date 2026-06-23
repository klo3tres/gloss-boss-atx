'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveMapProviderAction } from '@/app/(dashboard)/admin/integrations/maps-integration-actions';
import type { IntegrationProbe, MapProviderId } from '@/lib/integrations/maps-discovery-status';

const STATUS_LABEL = {
  connected: 'Connected',
  missing: 'Missing',
  invalid_key: 'Invalid key',
  billing_not_enabled: 'Billing not enabled',
  api_not_enabled: 'API not enabled',
  manual: 'Manual / list-only',
} as const;

export function MapsDiscoverySettings({
  mapProvider,
  effectiveProvider,
  probes,
}: {
  mapProvider: MapProviderId;
  effectiveProvider: MapProviderId;
  probes: IntegrationProbe[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <section className="rounded-3xl border border-violet-500/25 bg-black/60 p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-300">Maps &amp; Discovery</p>
      <p className="mt-2 text-sm text-zinc-500">
        Google Places is required for Lead Radar discovery. Google Maps powers map view. Apple MapKit is an optional visual layer only.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {(['google_maps', 'apple_mapkit', 'list_only'] as const).map((id) => (
          <button
            key={id}
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await saveMapProviderAction(id);
                router.refresh();
              })
            }
            className={`rounded-xl border px-4 py-3 text-left text-xs transition ${
              mapProvider === id
                ? 'border-violet-500/50 bg-violet-500/10 text-violet-100'
                : 'border-white/10 bg-black/40 text-zinc-500 hover:border-white/20'
            }`}
          >
            <p className="font-black uppercase text-[10px]">
              {id === 'google_maps' ? 'Google Maps' : id === 'apple_mapkit' ? 'Apple MapKit' : 'List-only fallback'}
            </p>
            <p className="mt-1 text-[10px] text-zinc-600">
              {id === 'google_maps'
                ? 'Map + routing preview'
                : id === 'apple_mapkit'
                  ? 'Alternative map layer'
                  : 'No map render — list view only'}
            </p>
          </button>
        ))}
      </div>
      {effectiveProvider !== mapProvider ? (
        <p className="mt-2 text-[10px] text-amber-300">
          Selected {mapProvider} unavailable — using {effectiveProvider.replace('_', ' ')}.
        </p>
      ) : null}

      <ul className="mt-5 space-y-3">
        {probes.map((p) => (
          <li key={p.id} className="rounded-2xl border border-white/5 bg-black/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-white">
                {p.label}
                {p.required ? <span className="ml-2 text-[9px] text-red-400">REQUIRED</span> : <span className="ml-2 text-[9px] text-zinc-600">OPTIONAL</span>}
              </p>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-black uppercase text-zinc-400">
                {STATUS_LABEL[p.status === 'connected' ? 'connected' : p.status === 'missing' ? 'missing' : p.status]}
              </span>
            </div>
            {p.disabledFeatures.length > 0 ? (
              <p className="mt-2 text-xs text-amber-200/90">
                <span className="font-bold">Disabled:</span> {p.disabledFeatures.join(' · ')}
              </p>
            ) : (
              <p className="mt-2 text-xs text-emerald-400/90">All related Titan features enabled.</p>
            )}
            <p className="mt-1 text-[10px] text-zinc-600">{p.fix}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
