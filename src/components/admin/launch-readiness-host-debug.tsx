'use client';

import { useEffect, useState } from 'react';
import { EXPECTED_APP_URL } from '@/lib/env/canonical-domain';

type HostDebug = {
  host: string;
  protocol: string;
  pathname: string;
  xForwardedHost: string;
  xForwardedProto: string;
  vercelEnv: string | null;
  appUrl: string | null;
  note: string;
};

export function LaunchReadinessHostDebug() {
  const [data, setData] = useState<HostDebug | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/debug/host', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as HostDebug;
      })
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Fetch failed'));
  }, []);

  const expectedHost = new URL(EXPECTED_APP_URL).host;
  const onCanonical = data ? data.host === expectedHost || data.xForwardedHost === expectedHost : null;

  return (
    <article className="rounded-2xl border border-white/10 bg-black/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black text-white">Runtime host diagnostic</h2>
        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${onCanonical === null ? 'bg-zinc-800 text-zinc-400' : onCanonical ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'}`}>
          {onCanonical === null ? 'loading' : onCanonical ? 'expected host' : 'host mismatch'}
        </span>
      </div>
      <p className="mt-2 text-xs text-zinc-500">Live fetch of <code className="text-zinc-300">/api/debug/host</code>. App middleware is auth-only — no www↔apex redirects in code.</p>
      {err ? <p className="mt-3 text-xs text-rose-300">{err}</p> : null}
      {data ? (
        <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
          <div><dt className="text-zinc-600">host</dt><dd className="font-mono text-white">{data.host || '—'}</dd></div>
          <div><dt className="text-zinc-600">x-forwarded-host</dt><dd className="font-mono text-white">{data.xForwardedHost || '—'}</dd></div>
          <div><dt className="text-zinc-600">protocol</dt><dd className="font-mono text-white">{data.protocol}</dd></div>
          <div><dt className="text-zinc-600">x-forwarded-proto</dt><dd className="font-mono text-white">{data.xForwardedProto || '—'}</dd></div>
          <div><dt className="text-zinc-600">expected</dt><dd className="font-mono text-emerald-300">{expectedHost}</dd></div>
          <div><dt className="text-zinc-600">NEXT_PUBLIC_APP_URL</dt><dd className="font-mono text-white">{data.appUrl ?? 'not set'}</dd></div>
        </dl>
      ) : null}
    </article>
  );
}
