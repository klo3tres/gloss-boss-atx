'use client';

import { useEffect, useState } from 'react';

export type SupplyLineState = {
  inventoryItemId: string;
  slug: string;
  label: string;
  quantity: number;
  unit: string;
};

export function WorkOrderSuppliesPanel({
  appointmentId,
  onChange,
}: {
  appointmentId: string;
  onChange: (payload: { lines: SupplyLineState[]; skipReason?: string }) => void;
}) {
  const [lines, setLines] = useState<SupplyLineState[]>([]);
  const [skip, setSkip] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void import('@/app/(dashboard)/tech/inventory-usage-actions').then(({ loadWorkOrderSuppliesAction }) =>
      loadWorkOrderSuppliesAction(appointmentId).then((res) => {
        if (res.lines?.length) setLines(res.lines);
        setLoaded(true);
      }),
    );
  }, [appointmentId]);

  useEffect(() => {
    onChange(skip ? { lines: [], skipReason: skipReason.trim() || 'No supplies logged' } : { lines });
  }, [lines, skip, skipReason, onChange]);

  if (!loaded && lines.length === 0) {
    return <p className="text-xs text-zinc-500">Loading suggested supplies…</p>;
  }

  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
      <p className="text-xs font-black uppercase tracking-widest text-cyan-200">Supplies used</p>
      <p className="mt-1 text-[11px] text-zinc-500">Prefilled from service type — adjust before completing job.</p>

      <label className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
        <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
        Skip inventory (no supplies used)
      </label>
      {skip ? (
        <input
          value={skipReason}
          onChange={(e) => setSkipReason(e.target.value)}
          placeholder="Why skip? (e.g. customer supplied products)"
          className="mt-2 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-xs text-white"
        />
      ) : (
        <ul className="mt-3 space-y-2">
          {lines.map((line, idx) => (
            <li key={line.inventoryItemId} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="min-w-[120px] flex-1 text-zinc-300">{line.label}</span>
              <input
                type="number"
                min={0}
                step={0.05}
                value={line.quantity}
                onChange={(e) => {
                  const qty = Number(e.target.value) || 0;
                  setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, quantity: qty } : l)));
                }}
                className="w-20 rounded-lg border border-white/10 bg-black px-2 py-1 text-white"
              />
              <span className="text-zinc-600">{line.unit}</span>
            </li>
          ))}
          {lines.length === 0 ? (
            <p className="text-[11px] text-amber-200">Inventory tables not ready — apply migration 000105/000106.</p>
          ) : null}
        </ul>
      )}
    </div>
  );
}
