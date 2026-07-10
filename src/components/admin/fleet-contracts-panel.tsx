'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FleetContract } from '@/lib/business-modules';
import { saveFleetContractsAction } from '@/app/(dashboard)/admin/marketing/actions';
import { displayMoney } from '@/lib/display-format';

export function FleetContractsPanel({ initialContracts }: { initialContracts: FleetContract[] }) {
  const router = useRouter();
  const [contracts, setContracts] = useState(initialContracts);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const add = () => {
    setContracts((prev) => [
      {
        id: crypto.randomUUID(),
        companyName: '',
        contactName: '',
        contactEmail: '',
        contactPhone: '',
        vehicleCount: 5,
        monthlyBillingCents: 0,
        routeNotes: '',
        renewalDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
        status: 'draft',
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.set('contracts', JSON.stringify(contracts));
    await saveFleetContractsAction(fd);
    setBusy(false);
    setMsg('Fleet contracts saved.');
    router.refresh();
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-gold-soft">Fleet contracts</p>
          <p className="mt-1 text-xs text-muted-foreground">Recurring routes, billing, renewals, and vehicle counts.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={add} className="rounded-xl border border-border px-3 py-2 text-[10px] font-black uppercase text-muted-foreground">
            Add contract
          </button>
          <button type="button" disabled={busy} onClick={() => void save()} className="rounded-xl bg-gold px-3 py-2 text-[10px] font-black uppercase text-black">
            {busy ? 'Saving…' : 'Save all'}
          </button>
        </div>
      </div>
      {msg ? <p className="mt-3 text-xs text-emerald-400">{msg}</p> : null}
      <div className="mt-4 space-y-3">
        {contracts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No fleet contracts yet. Add one to track recurring business accounts.
          </p>
        ) : (
          contracts.map((c, idx) => (
            <div key={c.id} className="rounded-2xl border border-border bg-muted/20 p-4 grid gap-3 md:grid-cols-2">
              <input
                value={c.companyName}
                onChange={(e) => setContracts((prev) => prev.map((x, i) => (i === idx ? { ...x, companyName: e.target.value } : x)))}
                placeholder="Company name"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={c.contactName}
                onChange={(e) => setContracts((prev) => prev.map((x, i) => (i === idx ? { ...x, contactName: e.target.value } : x)))}
                placeholder="Contact name"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={c.contactEmail}
                onChange={(e) => setContracts((prev) => prev.map((x, i) => (i === idx ? { ...x, contactEmail: e.target.value } : x)))}
                placeholder="Email"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={c.contactPhone}
                onChange={(e) => setContracts((prev) => prev.map((x, i) => (i === idx ? { ...x, contactPhone: e.target.value } : x)))}
                placeholder="Phone"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={c.vehicleCount}
                onChange={(e) => setContracts((prev) => prev.map((x, i) => (i === idx ? { ...x, vehicleCount: Number(e.target.value) } : x)))}
                placeholder="Vehicles"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={Math.round(c.monthlyBillingCents / 100)}
                onChange={(e) =>
                  setContracts((prev) => prev.map((x, i) => (i === idx ? { ...x, monthlyBillingCents: Math.round(Number(e.target.value) * 100) } : x)))
                }
                placeholder="Monthly billing ($)"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={c.renewalDate}
                onChange={(e) => setContracts((prev) => prev.map((x, i) => (i === idx ? { ...x, renewalDate: e.target.value } : x)))}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <select
                value={c.status}
                onChange={(e) =>
                  setContracts((prev) => prev.map((x, i) => (i === idx ? { ...x, status: e.target.value as FleetContract['status'] } : x)))
                }
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              >
                {['draft', 'active', 'paused', 'expired'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <textarea
                value={c.routeNotes}
                onChange={(e) => setContracts((prev) => prev.map((x, i) => (i === idx ? { ...x, routeNotes: e.target.value } : x)))}
                placeholder="Route / service notes"
                rows={2}
                className="md:col-span-2 rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <p className="md:col-span-2 text-xs text-muted-foreground">
                {c.vehicleCount} vehicles · {displayMoney(c.monthlyBillingCents)}/mo · renews {c.renewalDate}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
