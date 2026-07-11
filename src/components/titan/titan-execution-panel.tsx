'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { TitanExecutionRow } from '@/lib/titan/execution';

export function TitanExecutionPanel({ rows }: { rows: TitanExecutionRow[] }) {
  const [status, setStatus] = useState('all');
  const [channel, setChannel] = useState('all');
  const filtered = useMemo(() => rows.filter((row) => (status === 'all' || row.status === status) && (channel === 'all' || row.channel === channel)), [rows, status, channel]);
  const statuses = [...new Set(rows.map((row) => row.status).filter(Boolean))];
  return (
    <section className="rounded-3xl border border-cyan-500/20 bg-black/55 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">Execution dashboard</p><p className="mt-1 text-xs text-zinc-500">Real scheduled and provider-backed outbound operations.</p></div><div className="flex gap-2"><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-white/10 bg-black px-2 py-2 text-xs text-white"><option value="all">All statuses</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select><select value={channel} onChange={(event) => setChannel(event.target.value)} className="rounded-lg border border-white/10 bg-black px-2 py-2 text-xs text-white"><option value="all">All channels</option><option value="sms">SMS</option><option value="email">Email</option></select></div></div>
      {filtered.length ? <ul className="mt-4 space-y-2">{filtered.map((row) => { const href = row.entityType === 'opportunity' && row.entityId ? `/admin/titan/opportunities?open=${encodeURIComponent(row.entityId)}` : null; const content = <><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold text-white">{row.actionType.replaceAll('_', ' ')}</p><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${row.status === 'failed' ? 'border-rose-500/30 text-rose-300' : row.status === 'sent' || row.status === 'delivered' ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-300'}`}>{row.status}</span></div><p className="mt-1 text-[10px] text-zinc-500">{row.channel.toUpperCase()} · {row.recipient || 'recipient unavailable'} · {row.provider ?? row.source} · {new Date(row.createdAt).toLocaleString()}</p>{row.scheduledFor ? <p className="mt-1 text-[10px] text-cyan-300">Scheduled {new Date(row.scheduledFor).toLocaleString()}</p> : null}{row.error ? <p className="mt-1 text-[10px] text-rose-300">{row.error}</p> : null}</>; return <li key={`${row.source}-${row.id}`} className="rounded-xl border border-white/8 bg-black/40 p-3">{href ? <Link href={href} className="block hover:opacity-90">{content}</Link> : content}</li>; })}</ul> : <p className="mt-4 text-sm text-zinc-500">No executions match these filters.</p>}
    </section>
  );
}
