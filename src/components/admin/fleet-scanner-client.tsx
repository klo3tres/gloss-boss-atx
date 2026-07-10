'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Radar, Scan, Truck } from 'lucide-react';
import { runGooglePlacesLeadRadarAction } from '@/app/(dashboard)/admin/titan/lead-radar-actions';

export function FleetScannerClient() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const runScan = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await runGooglePlacesLeadRadarAction();
      if (res.error) setMsg(res.error);
      else setMsg(`Scan complete — ${res.created ?? 0} new fleet prospects added to Lead Radar.`);
    });
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gold-soft">
            <Truck className="h-4 w-4" /> Fleet Scanner
          </p>
          <h2 className="mt-2 text-xl font-black text-foreground">Discover commercial fleet prospects</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Scans Google Places around Austin for dealerships, fleets, HOAs, and commercial lots. Results land in Lead Radar as
            opportunities with business names, phones, and outreach scripts.
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={runScan}
          className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-3 text-[10px] font-black uppercase text-black disabled:opacity-50"
        >
          <Scan className="h-4 w-4" />
          {pending ? 'Scanning…' : 'Run fleet scan'}
        </button>
      </div>

      {msg ? <p className="mt-4 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">{msg}</p> : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/titan/lead-radar"
          className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-[10px] font-black uppercase text-muted-foreground hover:border-gold/30 hover:text-foreground"
        >
          <Radar className="h-3.5 w-3.5" /> Open Lead Radar
        </Link>
        <Link
          href="/admin/titan/opportunities"
          className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-[10px] font-black uppercase text-muted-foreground hover:border-gold/30 hover:text-foreground"
        >
          Opportunity board
        </Link>
      </div>
    </section>
  );
}
