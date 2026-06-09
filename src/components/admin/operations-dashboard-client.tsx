'use client';

import { useState } from 'react';
import { ToastActionForm } from '@/components/ui/toast-action-form';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import {
  addBusinessExpenseActionState,
  addJobMileageLogActionState,
  deleteJobMileageLogActionState,
  updateJobMileageLogActionState,
} from '@/app/(dashboard)/admin/operations/operations-actions';
import { ExpenseReceiptUpload } from '@/components/admin/expense-receipt-upload';

function money(cents: unknown) {
  const n = typeof cents === 'number' ? cents : 0;
  return `$${(n / 100).toFixed(2)}`;
}

export function OperationsDashboardClient({
  expenses,
  mileage,
  mileageSummary,
  mapsAutoNote,
  schemaReady,
}: {
  expenses: Record<string, unknown>[];
  mileage: Record<string, unknown>[];
  mileageSummary?: { today: number; month: number; year: number; lifetime: number };
  mapsAutoNote?: boolean;
  schemaReady: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className='space-y-8'>
      {msg ? (
        <p className='rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100' role='status'>
          {msg}
        </p>
      ) : null}

      {schemaReady ? (
        <>
          <section className='rounded-2xl border border-white/10 bg-zinc-950 p-5'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Expenses (tax archive)</p>
              <a
                href='/api/admin/operations/expenses-export'
                className='rounded-lg border border-gold/40 px-3 py-2 text-[10px] font-black uppercase text-gold-soft'
              >
                Export expenses CSV
              </a>
            </div>
            <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft mt-4'>Add expense</p>
            <ToastActionForm className='mt-3 grid gap-3 sm:grid-cols-4' action={addBusinessExpenseActionState}>
              <label className='text-xs text-zinc-400'>
                Amount ($)
                <input name='amountDollars' type='number' step='0.01' min='0.01' required className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' />
              </label>
              <label className='text-xs text-zinc-400'>
                Category
                <input name='category' className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' placeholder='supplies' />
              </label>
              <label className='text-xs text-zinc-400 sm:col-span-2'>
                Note
                <input name='note' className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' />
              </label>
              <label className='text-xs text-zinc-400'>
                Date
                <input name='incurredOn' type='date' className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' />
              </label>
              <div className='flex items-end'>
                <SubmitStatusButton pendingText='Saving…' className='rounded-xl border border-emerald-500/40 px-4 py-2 text-xs font-black uppercase text-emerald-200'>
                  Add expense
                </SubmitStatusButton>
              </div>
            </ToastActionForm>
            <ul className='mt-4 space-y-2 text-sm text-zinc-300'>
              {expenses.length === 0 ? <li className='text-zinc-500'>No expenses yet.</li> : null}
              {expenses.map((r) => (
                <li key={String(r.id)} className='rounded-lg border border-white/10 px-3 py-3'>
                  <div className='flex flex-wrap justify-between gap-2'>
                    <span>
                      {String(r.category ?? 'general')} · {String(r.incurred_on ?? r.incurred_at ?? r.created_at ?? '').slice(0, 10)}
                      {r.notes ? ` — ${String(r.notes)}` : r.note ? ` — ${String(r.note)}` : ''}
                    </span>
                    <span className='font-bold text-gold-soft'>{money(r.amount_cents)}</span>
                  </div>
                  {r.receipt_url ? (
                    <a href={String(r.receipt_url)} target='_blank' rel='noreferrer' className='mt-2 inline-block text-[10px] font-bold uppercase text-gold-soft underline'>
                      View receipt
                    </a>
                  ) : (
                    <ExpenseReceiptUpload expenseId={String(r.id)} onDone={() => setMsg('Receipt attached.')} />
                  )}
                </li>
              ))}
            </ul>
          </section>

          {mileageSummary ? (
            <div className='grid gap-3 sm:grid-cols-4'>
              {[
                ['Today (round-trip)', mileageSummary.today],
                ['This month', mileageSummary.month],
                ['This year', mileageSummary.year],
                ['Lifetime', mileageSummary.lifetime],
              ].map(([label, val]) => (
                <div key={label} className='rounded-xl border border-gold/20 bg-black/40 p-3'>
                  <p className='text-[10px] font-black uppercase text-zinc-500'>{label}</p>
                  <p className='mt-1 font-mono text-lg text-white'>{Number(val).toFixed(1)} mi</p>
                </div>
              ))}
            </div>
          ) : null}
          {mapsAutoNote ? (
            <p className='rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100'>
              Auto distance from home base requires <code className='text-amber-200'>MAPS_API_KEY</code> or{' '}
              <code className='text-amber-200'>GOOGLE_MAPS_API_KEY</code>. Manual mileage entry works now.
            </p>
          ) : null}
          <section className='rounded-2xl border border-white/10 bg-zinc-950 p-5'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Tax records — mileage</p>
              <a
                href='/api/admin/operations/mileage-export?format=csv'
                className='rounded-lg border border-gold/40 px-3 py-2 text-[10px] font-black uppercase text-gold-soft'
              >
                Export monthly CSV
              </a>
            </div>
            <p className='mt-2 text-xs text-zinc-500'>Grouped by calendar month for tax archive. PDF: print this CSV from Excel/Sheets.</p>
          </section>

          <section className='rounded-2xl border border-white/10 bg-zinc-950 p-5'>
            <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Log mileage</p>
            <ToastActionForm className='mt-3 grid gap-3 sm:grid-cols-4' action={addJobMileageLogActionState}>
              <label className='text-xs text-zinc-400'>
                One-way miles
                <input name='milesOneWay' type='number' step='0.1' min='0.1' required className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' />
              </label>
              <label className='text-xs text-zinc-400'>
                Trip
                <select name='tripMode' defaultValue='round_trip' className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white'>
                  <option value='round_trip'>Round-trip (×2)</option>
                  <option value='one_way'>One-way only</option>
                </select>
              </label>
              <label className='text-xs text-zinc-400 sm:col-span-2'>
                Appointment ID (optional)
                <input name='appointmentId' className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white font-mono text-[11px]' />
              </label>
              <label className='text-xs text-zinc-400'>
                Date
                <input name='loggedOn' type='date' className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' />
              </label>
              <label className='text-xs text-zinc-400 sm:col-span-3'>
                Note
                <input name='note' className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' />
              </label>
              <div className='flex items-end'>
                <SubmitStatusButton pendingText='Saving…' className='rounded-xl border border-emerald-500/40 px-4 py-2 text-xs font-black uppercase text-emerald-200'>
                  Log miles
                </SubmitStatusButton>
              </div>
            </ToastActionForm>
            <ul className='mt-4 space-y-2 text-sm text-zinc-300'>
              {mileage.length === 0 ? <li className='text-zinc-500'>No mileage logs yet.</li> : null}
              {mileage.map((r) => (
                <li key={String(r.id)} className='rounded-lg border border-white/10 px-3 py-3'>
                  <div className='flex flex-wrap items-start justify-between gap-2'>
                    <div>
                      <p className='font-bold text-white'>{String(r.customer_name ?? 'Customer')}</p>
                      <p className='text-xs text-gold-soft/90'>{String(r.appointment_label ?? '—')}</p>
                      <p className='text-xs text-zinc-400'>{String(r.vehicle ?? 'Vehicle')}</p>
                      <p className='text-xs text-zinc-500'>{String(r.address ?? '')}</p>
                      <p className='text-[10px] text-zinc-600'>Logged {String(r.logged_date ?? r.logged_at ?? '')}</p>
                      <p className='mt-1 text-xs text-gold-soft'>
                        One-way {String(r.miles_one_way ?? '—')} mi · Round-trip {String(r.round_trip_miles ?? '—')} mi
                        {typeof r.gas_cost_cents === 'number' ? ` · Gas ${money(r.gas_cost_cents)}` : ''}
                      </p>
                      <p className='text-[10px] text-zinc-600'>{String(r.logged_at ?? '')}</p>
                    </div>
                    {r.work_order_href ? (
                      <a href={String(r.work_order_href)} className='text-[10px] font-black uppercase text-gold-soft underline'>
                        Open work order
                      </a>
                    ) : null}
                  </div>
                  <ToastActionForm action={updateJobMileageLogActionState} className='mt-3 grid gap-2 border-t border-white/10 pt-3 sm:grid-cols-5'>
                    <input type='hidden' name='id' value={String(r.id)} />
                    <label className='text-[10px] text-zinc-500 sm:col-span-2'>
                      Edit one-way mi
                      <input
                        name='milesOneWay'
                        type='number'
                        step='0.1'
                        min='0.1'
                        defaultValue={String(
                          r.miles_one_way ??
                            (Number(r.round_trip_miles ?? r.total_miles ?? 0) / 2 || ''),
                        )}
                        className='mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-white'
                      />
                    </label>
                    <label className='text-[10px] text-zinc-500'>
                      Trip
                      <select name='tripMode' defaultValue={String(r.trip_mode ?? 'round_trip')} className='mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-white'>
                        <option value='round_trip'>Round-trip</option>
                        <option value='one_way'>One-way</option>
                      </select>
                    </label>
                    <label className='text-[10px] text-zinc-500 sm:col-span-2'>
                      Note
                      <input name='note' defaultValue={String(r.notes ?? '')} className='mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-white' />
                    </label>
                    <div className='flex flex-wrap gap-2 sm:col-span-5'>
                      <SubmitStatusButton pendingText='…' className='rounded border border-gold/40 px-2 py-1 text-[10px] font-black uppercase text-gold-soft'>
                        Save row
                      </SubmitStatusButton>
                    </div>
                  </ToastActionForm>
                  <ToastActionForm action={deleteJobMileageLogActionState} className='mt-1'>
                    <input type='hidden' name='id' value={String(r.id)} />
                    <SubmitStatusButton pendingText='…' className='text-[10px] font-black uppercase text-red-300/80'>
                      Delete row
                    </SubmitStatusButton>
                  </ToastActionForm>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
