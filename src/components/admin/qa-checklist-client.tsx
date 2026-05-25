'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type QaStatus = 'pass' | 'fail' | 'manual' | 'untested';

type QaItem = {
  id: string;
  label: string;
  href: string;
  hint?: string;
};

const ITEMS: QaItem[] = [
  { id: 'book_deposit', label: 'Booking — pay deposit', href: '/book' },
  { id: 'book_full', label: 'Booking — pay full', href: '/book' },
  { id: 'pay_later', label: 'Pay later fallback', href: '/book' },
  { id: 'free_promo', label: 'FREE promo comp', href: '/book' },
  { id: 'test1_promo', label: 'TEST1 $1 Stripe test', href: '/book' },
  { id: 'truck_pricing', label: 'Truck / SUV / sedan pricing', href: '/services' },
  { id: 'addons_class', label: 'Add-ons by vehicle class', href: '/admin/addons' },
  { id: 'invoice_builder', label: 'Custom invoice builder', href: '/admin/work-orders' },
  { id: 'receipt_pdf', label: 'Receipt PDF matches page', href: '/admin/receipts' },
  { id: 'receipt_email', label: 'Receipt email matches page', href: '/admin/receipts' },
  { id: 'agreement_pdf', label: 'Agreement PDF print', href: '/admin/agreements' },
  { id: 'photo_upload', label: 'Work order photo upload', href: '/tech' },
  { id: 'crm_sync', label: 'CRM vehicle sync', href: '/admin/customers' },
  { id: 'balance_checkout', label: 'Balance checkout', href: '/admin/work-orders' },
  { id: 'complete_job', label: 'Complete job gates', href: '/tech' },
  { id: 'gallery_cms', label: 'Gallery CMS', href: '/admin/cms' },
  { id: 'dispatch', label: 'Dispatch board', href: '/admin/dispatch' },
  { id: 'twilio', label: 'Twilio / SMS status', href: '/admin/integrations' },
  { id: 'vehicle_save', label: 'Save WO vehicles (no deletion)', href: '/admin/work-orders' },
  { id: 'snapshot', label: 'Order snapshot / receipt truth', href: '/admin/receipts' },
];

const LS_KEY = 'gb_qa_checklist_v1';

type Stored = Record<string, { status: QaStatus; testedAt: string; notes: string }>;

export function QaChecklistClient() {
  const [state, setState] = useState<Stored>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setState(JSON.parse(raw) as Stored);
    } catch {
      /* ignore */
    }
  }, []);

  const save = (next: Stored) => {
    setState(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  };

  const setStatus = (id: string, status: QaStatus) => {
    const prev = state[id] ?? { status: 'untested' as QaStatus, testedAt: '', notes: '' };
    save({
      ...state,
      [id]: { ...prev, status, testedAt: new Date().toISOString() },
    });
  };

  const setNotes = (id: string, notes: string) => {
    const prev = state[id] ?? { status: 'untested' as QaStatus, testedAt: '', notes: '' };
    save({ ...state, [id]: { ...prev, notes } });
  };

  const counts = ITEMS.reduce(
    (acc, item) => {
      const st = state[item.id]?.status ?? 'untested';
      acc[st] += 1;
      return acc;
    },
    { pass: 0, fail: 0, manual: 0, untested: 0 } as Record<QaStatus, number>,
  );

  return (
    <div className='space-y-6'>
      <div className='grid gap-3 sm:grid-cols-4'>
        <p className='rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100'>
          Pass: {counts.pass}
        </p>
        <p className='rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100'>
          Fail: {counts.fail}
        </p>
        <p className='rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100'>
          Manual: {counts.manual}
        </p>
        <p className='rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-sm text-zinc-300'>
          Untested: {counts.untested}
        </p>
      </div>

      <ul className='space-y-3'>
        {ITEMS.map((item) => {
          const row = state[item.id];
          const status = row?.status ?? 'untested';
          return (
            <li key={item.id} className='rounded-2xl border border-white/10 bg-zinc-950/80 p-4'>
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div>
                  <p className='font-bold text-white'>{item.label}</p>
                  {row?.testedAt ? (
                    <p className='mt-1 text-[10px] text-zinc-500'>Last tested: {new Date(row.testedAt).toLocaleString()}</p>
                  ) : null}
                </div>
                <Link href={item.href} className='text-xs font-black uppercase text-gold-soft underline'>
                  Open →
                </Link>
              </div>
              <div className='mt-3 flex flex-wrap gap-2'>
                {(['pass', 'fail', 'manual', 'untested'] as QaStatus[]).map((s) => (
                  <button
                    key={s}
                    type='button'
                    onClick={() => setStatus(item.id, s)}
                    className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase ${
                      status === s
                        ? s === 'pass'
                          ? 'bg-emerald-500 text-black'
                          : s === 'fail'
                            ? 'bg-red-500 text-white'
                            : s === 'manual'
                              ? 'bg-amber-500 text-black'
                              : 'bg-zinc-700 text-white'
                        : 'border border-white/15 text-zinc-400'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <textarea
                value={row?.notes ?? ''}
                onChange={(e) => setNotes(item.id, e.target.value)}
                placeholder='Notes from last test…'
                rows={2}
                className='mt-3 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white'
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
