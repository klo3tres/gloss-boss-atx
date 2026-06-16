'use client';

import { useMemo, useState } from 'react';
import { CustomerCreditsManager } from './customer-credits-manager';
import { CreditCard, Search } from 'lucide-react';

type Customer = { id: string; full_name: string | null; email: string | null; phone?: string | null };

type Props = {
  customers: Customer[];
};

export function RevenueIssueCreditPanel({ customers }: Props) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers.slice(0, 12);
    return customers
      .filter((c) => {
        const name = (c.full_name ?? '').toLowerCase();
        const email = (c.email ?? '').toLowerCase();
        const phone = (c.phone ?? '').replace(/\D/g, '');
        const qDigits = q.replace(/\D/g, '');
        return name.includes(q) || email.includes(q) || (qDigits.length >= 4 && phone.includes(qDigits));
      })
      .slice(0, 20);
  }, [customers, query]);

  const selected = customers.find((c) => c.id === selectedId);

  return (
    <div className="rounded-3xl border border-gold/25 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black p-6 flex flex-col justify-between shadow-xl">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-gold-soft mb-1 flex items-center gap-1.5">
          <CreditCard className="h-4 w-4" /> Issue Customer Store Credit
        </p>
        <p className="text-xs text-zinc-500 mb-4">
          Search by name, email, or phone — then issue promotional, makeup, or manual credit.
        </p>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer name, email, or phone…"
            className="w-full rounded-lg border border-zinc-700 bg-black py-2 pl-10 pr-3 text-sm text-white focus:border-gold/50 focus:outline-none"
          />
        </div>

        {selected ? (
          <div className="mb-3 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-sm text-zinc-200">
            Selected: <span className="font-semibold text-white">{selected.full_name || selected.email}</span>
            {selected.email ? <span className="block text-xs text-zinc-400">{selected.email}</span> : null}
            <button type="button" onClick={() => setSelectedId('')} className="mt-1 text-xs text-gold-soft underline">
              Clear
            </button>
          </div>
        ) : null}

        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-zinc-800 bg-black/40 p-2">
          {filtered.length === 0 ? (
            <li className="px-2 py-3 text-xs text-zinc-500">No customers match your search.</li>
          ) : (
            filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full rounded-md px-2 py-2 text-left text-sm transition ${
                    selectedId === c.id ? 'bg-gold/20 text-white' : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span className="font-medium">{c.full_name || c.email || c.id}</span>
                  {c.email ? <span className="block text-xs text-zinc-500">{c.email}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="mt-4 flex justify-end">
        {selectedId ? (
          <CustomerCreditsManager customerId={selectedId} credits={[]} redemptions={[]} showCompactButtonOnly />
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-zinc-500 cursor-not-allowed"
          >
            Select customer first
          </button>
        )}
      </div>
    </div>
  );
}
