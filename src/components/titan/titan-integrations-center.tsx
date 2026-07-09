'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { BusinessIntegration } from '@/lib/titan/integrations';
import { TITAN_INTEGRATION_CATALOG } from '@/lib/titan/industry-profiles';

export function TitanIntegrationsCenter({
  integrations,
  businessId,
}: {
  integrations: BusinessIntegration[];
  businessId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const byType = new Map(integrations.map((i) => [i.integrationType, i]));

  const onSync = (type: string) => {
    startTransition(async () => {
      const res = await fetch(`/api/titan/integrations/${type}/sync`, { method: 'POST' });
      const json = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      setSyncMsg(json.message ?? json.error ?? (json.ok ? 'Sync started' : 'Sync failed'));
    });
  };

  const onDisconnect = (type: string) => {
    if (!confirm(`Disconnect ${type}?`)) return;
    startTransition(async () => {
      await fetch(`/api/titan/integrations/${type}/disconnect`, { method: 'POST' });
      window.location.reload();
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black text-white">Integrations Center</h2>
        <p className="mt-1 text-sm text-zinc-400">
          One Titan OAuth app — businesses click Connect, authorize, and tokens are stored per business.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {TITAN_INTEGRATION_CATALOG.map((card) => {
          const row = byType.get(card.type);
          const connected = row?.status === 'connected';
          const errored = row?.status === 'error';
          const connectHref =
            card.type === 'google_calendar' || card.type === 'gmail'
              ? `/api/titan/integrations/google/connect?service=${card.type === 'gmail' ? 'gmail' : 'calendar'}&business_id=${businessId}&return_to=/titan/connect`
              : card.connectPath ?? null;

          return (
            <article
              key={card.type}
              className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black text-white">{card.label}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">{card.description}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase ${
                    connected
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : errored
                        ? 'bg-rose-500/15 text-rose-300'
                        : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {row?.status ?? 'disconnected'}
                </span>
              </div>

              <dl className="mt-4 space-y-1 text-[11px] text-zinc-500">
                <div className="flex justify-between gap-2">
                  <dt>Account</dt>
                  <dd className="text-zinc-300">{row?.connectedAccount ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Last sync</dt>
                  <dd className="text-zinc-300">
                    {row?.lastSyncAt ? new Date(row.lastSyncAt).toLocaleString() : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="mb-1">Permissions</dt>
                  <dd className="text-zinc-400">{(row?.permissions ?? card.permissions).join(' · ')}</dd>
                </div>
                {row?.lastError ? (
                  <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-2 py-1 text-rose-200">
                    {row.lastError}
                  </div>
                ) : null}
                {card.docsHint ? <dd className="text-zinc-600">{card.docsHint}</dd> : null}
              </dl>

              <div className="mt-4 flex flex-wrap gap-2">
                {connectHref && !connected ? (
                  <a
                    href={connectHref}
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-[10px] font-black uppercase text-black"
                  >
                    Connect
                  </a>
                ) : null}
                {connected && (card.type === 'google_calendar' || card.type === 'gmail') ? (
                  <a
                    href={connectHref ?? '#'}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-300"
                  >
                    Reconnect
                  </a>
                ) : null}
                {connected && card.type === 'google_calendar' ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onSync('google_calendar')}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-300"
                  >
                    Sync now
                  </button>
                ) : null}
                {connected && row?.id && !row.id.startsWith('platform-') ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onDisconnect(card.type)}
                    className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-[10px] font-black uppercase text-rose-300"
                  >
                    Disconnect
                  </button>
                ) : null}
                {card.type === 'website_forms' ? (
                  <Link
                    href="/titan/api-keys"
                    className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-[10px] font-black uppercase text-amber-200"
                  >
                    Manage API keys
                  </Link>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {syncMsg ? <p className="text-xs text-zinc-400">{syncMsg}</p> : null}
    </div>
  );
}
