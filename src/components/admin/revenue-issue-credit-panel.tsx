'use client';

import { useState } from 'react';
import { CustomerCreditsManager } from './customer-credits-manager';
import { CreditCard } from 'lucide-react';

type Props = {
  customers: Array<{ id: string; full_name: string | null; email: string | null }>;
};

export function RevenueIssueCreditPanel({ customers }: Props) {
  const [selectedId, setSelectedId] = useState('');

  return (
    <div className="rounded-3xl border border-gold/25 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black p-6 flex flex-col justify-between shadow-xl">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-gold-soft mb-1 flex items-center gap-1.5">
          <CreditCard className="h-4 w-4" /> Issue Customer Store Credit
        </p>
        <p className="text-xs text-zinc-500 mb-4">
          Select a customer from the CRM and issue a promotional, makeup, or manual credit.
        </p>
        
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white focus:border-gold/50 focus:outline-none"
        >
          <option value="">-- Select Customer to Credit --</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name || c.email || c.id}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex justify-end">
        {selectedId ? (
          <CustomerCreditsManager
            customerId={selectedId}
            credits={[]}
            redemptions={[]}
            showCompactButtonOnly
          />
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-zinc-500 cursor-not-allowed"
          >
            Select Customer first
          </button>
        )}
      </div>
    </div>
  );
}
