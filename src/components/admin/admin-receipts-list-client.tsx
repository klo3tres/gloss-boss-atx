'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ReceiptSendForm } from '@/components/admin/receipt-send-form';
import { isTestLikeJob } from '@/lib/tech-job-filters';

export type ReceiptListRow = {
  id: string;
  receiptId: string;
  paymentId: string;
  receiptNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  address: string;
  vehicle: string;
  amountCents: number;
  balanceCents: number;
  method: string;
  status: string;
  paidAt: string;
  isTest: boolean;
  isVoided: boolean;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function AdminReceiptsListClient({
  rows,
  includeTestDefault = false,
}: {
  rows: ReceiptListRow[];
  includeTestDefault?: boolean;
}) {
  const [q, setQ] = useState('');
  const [includeTest, setIncludeTest] = useState(includeTestDefault);
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'balance' | 'voided'>('all');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (!includeTest && r.isTest) return false;
      if (statusFilter === 'paid' && r.balanceCents > 0) return false;
      if (statusFilter === 'balance' && r.balanceCents <= 0) return false;
      if (statusFilter === 'voided' && !r.isVoided) return false;
      if (statusFilter === 'all' && r.isVoided) return false;
      if (!needle) return true;
      const hay = [r.customerName, r.customerEmail, r.customerPhone, r.address, r.vehicle, r.receiptNumber, r.id, r.paymentId]
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q, includeTest, statusFilter]);

  const validRows = rows.filter((r) => !r.isTest && !r.isVoided);
  const totalPaid = validRows.reduce((s, r) => s + r.amountCents, 0);

  return (
    <>
      <section className='grid gap-4 md:grid-cols-3'>
        <div className='rounded-3xl border border-gold/25 bg-zinc-950/90 p-5'>
          <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Valid receipts</p>
          <p className='mt-2 text-3xl font-black text-white'>{validRows.length}</p>
        </div>
        <div className='rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5'>
          <p className='text-xs font-black uppercase tracking-[0.22em] text-emerald-200'>Paid total</p>
          <p className='mt-2 text-3xl font-black text-white'>{money(totalPaid)}</p>
        </div>
        <Link href='/admin/payments' className='rounded-3xl border border-white/10 bg-black/40 p-5 transition hover:border-gold/40'>
          <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Payments ledger</p>
          <p className='mt-2 text-sm text-zinc-400'>Stripe, cash, Zelle source rows</p>
        </Link>
      </section>

      <section className='mt-6 rounded-3xl border border-gold/20 bg-zinc-950/90 p-5'>
        <div className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
          <label className='block flex-1 text-sm'>
            <span className='mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400'>Search</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder='Customer, email, phone, vehicle, receipt ID…'
              className='gb-input w-full'
            />
          </label>
          <div className='flex flex-wrap gap-2'>
            {(['all', 'paid', 'balance', 'voided'] as const).map((f) => (
              <button
                key={f}
                type='button'
                onClick={() => setStatusFilter(f)}
                className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase ${
                  statusFilter === f ? 'border-gold/50 bg-gold/15 text-gold-soft' : 'border-white/15 text-zinc-400'
                }`}
              >
                {f}
              </button>
            ))}
            <button
              type='button'
              onClick={() => setIncludeTest((v) => !v)}
              className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase ${
                includeTest ? 'border-amber-500/50 text-amber-200' : 'border-white/15 text-zinc-400'
              }`}
            >
              {includeTest ? 'Hide test' : 'Include test'}
            </button>
          </div>
        </div>

        <div className='mt-5 grid gap-3'>
          {filtered.length === 0 ? (
            <div className='rounded-xl border border-dashed border-white/10 p-8 text-center'>
              <p className='text-sm font-bold text-zinc-300'>No receipts match your filters</p>
              <p className='mx-auto mt-2 max-w-md text-xs text-zinc-500'>
                Receipts appear after succeeded payments post. Test bookings are hidden by default — toggle Include test to audit sandbox jobs.
              </p>
            </div>
          ) : null}
          {filtered.map((r) => (
            <article key={`${r.id}-${r.paidAt}`} className='rounded-2xl border border-white/10 bg-black/35 p-4 transition hover:border-gold/30'>
              <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
                <div>
                  <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>{r.receiptNumber}</p>
                  <h2 className='mt-2 text-xl font-black text-white'>{r.customerName}</h2>
                  <p className='text-sm text-zinc-400'>
                    {r.customerEmail} · {r.customerPhone}
                  </p>
                  <p className='mt-1 text-sm text-zinc-500'>{r.address || 'Service address pending'}</p>
                  {r.vehicle ? <p className='mt-1 text-xs text-zinc-500'>{r.vehicle}</p> : null}
                </div>
                <div className='text-left lg:text-right'>
                  <p className='text-2xl font-black text-white'>{money(r.amountCents)}</p>
                  {r.balanceCents > 0 ? <p className='text-xs text-amber-200'>Balance {money(r.balanceCents)}</p> : null}
                  <p className='text-xs text-zinc-400'>
                    {r.method.replace(/_/g, ' ')} · {r.status}
                    {r.isTest ? ' · test' : ''}
                  </p>
                  <p className='text-xs text-zinc-500'>{r.paidAt}</p>
                </div>
              </div>
              <div className='mt-4 flex flex-wrap gap-2'>
                <Link href={`/admin/receipts/${encodeURIComponent(r.receiptId || r.paymentId || r.id)}`} className='rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black'>
                  View receipt
                </Link>
                <Link href={`/admin/work-orders/${encodeURIComponent(r.id)}?shell=admin`} className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-300'>
                  Work order
                </Link>
                {r.paymentId ? (
                  <Link href={`/admin/payments/${r.paymentId}`} className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-300'>
                    Payment
                  </Link>
                ) : null}
                <ReceiptSendForm receiptId={r.receiptId || undefined} paymentId={r.paymentId || undefined} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

export function mapReceiptRows(raw: Record<string, unknown>[]): ReceiptListRow[] {
  return raw.map((r) => {
    const receipt = (r.receipt && typeof r.receipt === 'object' ? r.receipt : {}) as Record<string, unknown>;
    const customer = (r.customer && typeof r.customer === 'object' ? r.customer : {}) as Record<string, unknown>;
    const id = String(receipt.id || r.payment_id || r.id || '');
    const paymentId = String(r.payment_id || '');
    const meta = r.metadata && typeof r.metadata === 'object' ? (r.metadata as Record<string, unknown>) : {};
    const isTest =
      Boolean(meta.is_test || meta.test) ||
      isTestLikeJob({ guest_email: r.guest_email, guest_name: r.guest_name } as Record<string, unknown>);
    const status = String(r.status || receipt.status || '');
    return {
      id,
      receiptId: String(receipt.id || ''),
      paymentId,
      receiptNumber: String(receipt.receipt_number || `RCPT-${id.slice(0, 8).toUpperCase()}`),
      customerName: String(r.guest_name || customer.full_name || r.customer_name || 'Customer'),
      customerEmail: String(r.guest_email || customer.email || r.email || ''),
      customerPhone: String(r.guest_phone || customer.phone || r.phone || ''),
      address: [r.service_address, r.service_city, r.service_state, r.service_zip].map(String).filter(Boolean).join(', '),
      vehicle: String(r.vehicle_description || ''),
      amountCents: typeof r.amount_cents === 'number' ? r.amount_cents : typeof receipt.amount_cents === 'number' ? receipt.amount_cents : 0,
      balanceCents: typeof r.balance_due_cents === 'number' ? r.balance_due_cents : 0,
      method: String(r.payment_method || r.payment_kind || receipt.payment_method || 'stripe'),
      status,
      paidAt: String(r.paid_at || r.created_at || receipt.created_at || ''),
      isTest,
      isVoided: status.toLowerCase().includes('void') || Boolean(r.voided_at || r.voided),
    };
  });
}
