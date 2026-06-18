'use client';

import { Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';

export function WorkOrderLiveSearch({ total }: { total: number }) {
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(total);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-work-order-card]'));
    let count = 0;
    cards.forEach((card) => {
      const haystack = String(card.dataset.search ?? '').toLowerCase();
      const show = !q || q.split(/\s+/).every((part) => haystack.includes(part));
      card.style.display = show ? '' : 'none';
      if (show) count += 1;
    });
    setVisible(count);
  }, [query, total]);

  return (
    <div className="mb-5 rounded-3xl border border-gold/15 bg-black/45 p-4 shadow-[0_0_32px_rgba(212,166,77,0.08)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <label className="relative block flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gold-soft" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search customer, email, phone, vehicle, color, service, status, or work order ID"
            className="w-full rounded-2xl border border-white/10 bg-zinc-950/85 py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-gold/45 focus:ring-2 focus:ring-gold/10"
          />
        </label>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-zinc-300">
          <SlidersHorizontal className="h-4 w-4 text-gold-soft" />
          <span className="font-black uppercase tracking-[0.18em]">{visible} showing</span>
        </div>
      </div>
    </div>
  );
}
