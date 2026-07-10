'use client';

import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

export type ReferralTreeNode = {
  id: string;
  referrerName: string;
  referredName: string;
  status: string;
  createdAt: string;
  rewardCents: number;
  fraudFlags: string[];
};

function statusIcon(status: string) {
  const s = status.toLowerCase();
  if (s === 'completed' || s === 'reward_issued') return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (s === 'booked' || s === 'pending') return <Clock className="h-4 w-4 text-amber-400" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
}

export function ReferralTreePanel({ nodes }: { nodes: ReferralTreeNode[] }) {
  if (nodes.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Referral activity will appear here as customers share codes and friends book.
      </p>
    );
  }

  const pending = nodes.filter((n) => ['pending', 'booked'].includes(n.status.toLowerCase()));
  const completed = nodes.filter((n) => ['completed', 'reward_issued'].includes(n.status.toLowerCase()));
  const flagged = nodes.filter((n) => n.fraudFlags.length > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Pending / booked', pending.length],
          ['Completed', completed.length],
          ['Fraud review', flagged.length],
        ].map(([label, count]) => (
          <div key={String(label)} className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-[10px] font-black uppercase text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-black text-foreground">{count}</p>
          </div>
        ))}
      </div>
      <ul className="space-y-2">
        {nodes.map((n) => (
          <li key={n.id} className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                {statusIcon(n.status)}
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {n.referrerName} → {n.referredName || 'Friend'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {n.status} · {new Date(n.createdAt).toLocaleDateString()}
                    {n.rewardCents > 0 ? ` · $${(n.rewardCents / 100).toFixed(0)} reward` : ''}
                  </p>
                </div>
              </div>
              {n.fraudFlags.length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase text-amber-200">
                  <AlertTriangle className="h-3 w-3" /> Review
                </span>
              ) : null}
            </div>
            {n.fraudFlags.length > 0 ? (
              <ul className="mt-2 text-[11px] text-amber-200/90">
                {n.fraudFlags.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
