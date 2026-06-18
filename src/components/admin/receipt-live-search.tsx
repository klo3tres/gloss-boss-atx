'use client';

import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ReceiptLiveSearch({ total }: { total: number }) {
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(total);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-receipt-card]'));
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
    <div className="mb-4 rounded-3xl border border-gold/15 bg-black/45 p-4 backdrop-blur-xl">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gold-soft" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search receipts by customer, email, phone, amount, status, work order, or payment ID"
          className="w-full rounded-2xl border border-white/10 bg-zinc-950/85 py-3 pl-11 pr-28 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-gold/45"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-300">
          {visible} showing
        </span>
      </label>
    </div>
  );
}
