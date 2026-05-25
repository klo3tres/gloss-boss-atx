'use client';

import { useState } from 'react';
import { ToastActionForm } from '@/components/ui/toast-action-form';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import {
  addBusinessExpenseActionState,
  addJobMileageLogActionState,
} from '@/app/(dashboard)/admin/operations/operations-actions';
import { setFleetServicesSettingAction } from '@/app/(dashboard)/admin/operations/fleet-actions';

function money(cents: unknown) {
  const n = typeof cents === 'number' ? cents : 0;
  return `$${(n / 100).toFixed(2)}`;
}

export function OperationsDashboardClient({
  expenses,
  mileage,
  fleetEnabled,
  fleetBlurb,
  schemaReady,
}: {
  expenses: Record<string, unknown>[];
  mileage: Record<string, unknown>[];
  fleetEnabled: boolean;
  fleetBlurb: string;
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

      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Fleet & business (public /services)</p>
        <form
          action={setFleetServicesSettingAction}
          className='mt-4 space-y-3'
        >
          <label className='flex items-center gap-2 text-sm text-zinc-200'>
            <input name='fleetEnabled' type='checkbox' defaultChecked={fleetEnabled} />
            Show fleet section on Services page
          </label>
          <label className='block text-xs text-zinc-400'>
            Blurb
            <textarea
              name='fleetBlurb'
              rows={3}
              defaultValue={fleetBlurb}
              className='mt-1 w-full max-w-xl rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white'
              placeholder='Fleet, dealership, and business accounts — call for volume pricing.'
            />
          </label>
          <button type='submit' className='rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-black uppercase text-gold-soft'>
            Save fleet visibility
          </button>
        </form>
      </section>

      {schemaReady ? (
        <>
          <section className='rounded-2xl border border-white/10 bg-zinc-950 p-5'>
            <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Add expense</p>
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
                <li key={String(r.id)} className='flex justify-between rounded-lg border border-white/10 px-3 py-2'>
                  <span>
                    {String(r.category ?? 'general')} · {String(r.incurred_on ?? r.created_at ?? '')}
                    {r.note ? ` — ${String(r.note)}` : ''}
                  </span>
                  <span className='font-bold text-gold-soft'>{money(r.amount_cents)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className='rounded-2xl border border-white/10 bg-zinc-950 p-5'>
            <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Log mileage</p>
            <ToastActionForm className='mt-3 grid gap-3 sm:grid-cols-4' action={addJobMileageLogActionState}>
              <label className='text-xs text-zinc-400'>
                Miles
                <input name='miles' type='number' step='0.1' min='0.1' required className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' />
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
                <li key={String(r.id)} className='flex justify-between rounded-lg border border-white/10 px-3 py-2'>
                  <span>
                    {typeof r.miles === 'number' ? `${r.miles} mi` : '—'} · {String(r.logged_on ?? '')}
                    {r.appointment_id ? ` · ${String(r.appointment_id).slice(0, 8)}…` : ''}
                  </span>
                  <span className='text-zinc-500 text-xs'>{r.note ? String(r.note) : ''}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
