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
import { GlassCard, PremiumBadge, SectionEyebrow } from '@/components/ui/premium';
import { DollarSign, MapPin, Calendar, Plus, FileText, ChevronRight, Fuel, Wrench, AlertTriangle, Eye } from 'lucide-react';

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
        <div className='rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-bold text-emerald-200' role='status'>
          {msg}
        </div>
      ) : null}

      {schemaReady ? (
        <>
          {/* EXPENSES LOG & FORM */}
          <GlassCard className="space-y-6">
            <div className='flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3'>
              <div>
                <SectionEyebrow>Rig Expenses & Operating Costs</SectionEyebrow>
                <p className="text-xs text-zinc-500 mt-1">Record business spending for tax reconciliation.</p>
              </div>
              <a
                href='/api/admin/operations/expenses-export'
                className='rounded-xl border border-gold/25 bg-gold/5 px-4 py-2 text-[10px] font-black uppercase text-gold-soft hover:bg-gold/15 transition'
              >
                Export CSV
              </a>
            </div>

            <ToastActionForm className='grid gap-4 sm:grid-cols-4 bg-black/40 border border-white/5 p-5 rounded-2xl' action={addBusinessExpenseActionState}>
              <label className='text-xs font-bold text-zinc-400'>
                Amount ($)
                <input 
                  name='amountDollars' 
                  type='number' 
                  step='0.01' 
                  min='0.01' 
                  required 
                  placeholder="0.00"
                  className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-gold/50 outline-none transition' 
                />
              </label>
              <label className='text-xs font-bold text-zinc-400'>
                Category
                <input 
                  name='category' 
                  required
                  placeholder='e.g., supplies, gas, chemical'
                  className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-gold/50 outline-none transition' 
                />
              </label>
              <label className='text-xs font-bold text-zinc-400 sm:col-span-2'>
                Internal Note / Supplier
                <input 
                  name='note' 
                  placeholder="e.g., Microfiber towels from AutoZone"
                  className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-gold/50 outline-none transition' 
                />
              </label>
              <label className='text-xs font-bold text-zinc-400'>
                Expense Date
                <input 
                  name='incurredOn' 
                  type='date' 
                  className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-gold/50 outline-none transition' 
                />
              </label>
              <div className='flex items-end sm:col-span-3 justify-end'>
                <SubmitStatusButton pendingText='Recording…' className='rounded-xl bg-gold px-5 py-2.5 text-xs font-black uppercase text-black hover:brightness-110 transition'>
                  Add Expense
                </SubmitStatusButton>
              </div>
            </ToastActionForm>

            <div className="space-y-3">
              <p className="text-xs font-black uppercase tracking-wider text-zinc-500">Recent Expense Log</p>
              <div className="space-y-3">
                {expenses.length === 0 ? (
                  <p className='text-xs text-zinc-500 italic py-6 text-center border border-dashed border-white/10 rounded-xl'>No expenses logged in this range.</p>
                ) : (
                  expenses.slice(0, 15).map((r) => (
                    <div key={String(r.id)} className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 rounded-xl border border-white/5 bg-zinc-900/25 p-4 text-xs'>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white uppercase tracking-wider text-[10px] font-mono rounded bg-white/5 px-2 py-0.5 border border-white/10">
                            {String(r.category ?? 'general')}
                          </span>
                          <span className="text-zinc-500">{String(r.incurred_on ?? r.incurred_at ?? r.created_at ?? '').slice(0, 10)}</span>
                        </div>
                        <p className='text-zinc-300 mt-1.5 font-medium'>
                          {r.notes ? String(r.notes) : r.note ? String(r.note) : '(no description)'}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-white/5 pt-2.5 sm:pt-0">
                        <span className='font-mono font-black text-rose-300 text-sm'>{money(r.amount_cents)}</span>
                        <div>
                          {r.receipt_url ? (
                            <a 
                              href={String(r.receipt_url)} 
                              target='_blank' 
                              rel='noreferrer' 
                              className='inline-flex items-center gap-1.5 rounded-lg border border-white/10 hover:border-gold/30 bg-black/45 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-300 hover:text-white transition'
                            >
                              <Eye className="h-3 w-3 text-gold-soft" /> Receipt
                            </a>
                          ) : (
                            <ExpenseReceiptUpload expenseId={String(r.id)} onDone={() => setMsg('Receipt uploaded successfully.')} />
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </GlassCard>

          {/* MILEAGE STATS GRID */}
          {mileageSummary ? (
            <div className='grid gap-4 grid-cols-2 lg:grid-cols-4'>
              {[
                { label: 'Today (Round-trip)', val: mileageSummary.today, Icon: Fuel },
                { label: 'This month', val: mileageSummary.month, Icon: MapPin },
                { label: 'This year', val: mileageSummary.year, Icon: Calendar },
                { label: 'Lifetime total', val: mileageSummary.lifetime, Icon: Wrench },
              ].map(({ label, val, Icon }) => (
                <div key={label} className='rounded-2xl border border-white/10 bg-black/45 p-4 relative overflow-hidden'>
                  <div className="flex justify-between items-center text-zinc-500">
                    <span className='text-[10px] font-black uppercase tracking-wider'>{label}</span>
                    <Icon className="h-4 w-4 text-gold-soft opacity-60" />
                  </div>
                  <p className='mt-2.5 font-mono text-xl font-black text-white'>{Number(val).toFixed(1)} mi</p>
                </div>
              ))}
            </div>
          ) : null}

          {mapsAutoNote ? (
            <div className='rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-200 flex items-start gap-2.5'>
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p>
                Auto distance from home base requires <code className='text-amber-200'>MAPS_API_KEY</code> or{' '}
                <code className='text-amber-200'>GOOGLE_MAPS_API_KEY</code>. Manual mileage entry works now.
              </p>
            </div>
          ) : null}

          {/* MILEAGE LOGGING & FORM */}
          <GlassCard className="space-y-6">
            <div className='flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3'>
              <div>
                <SectionEyebrow>Field Mileage & Fuel Tracking</SectionEyebrow>
                <p className="text-xs text-zinc-500 mt-1">Record rig travel miles for deduction write-offs.</p>
              </div>
              <a
                href='/api/admin/operations/mileage-export?format=csv'
                className='rounded-xl border border-gold/25 bg-gold/5 px-4 py-2 text-[10px] font-black uppercase text-gold-soft hover:bg-gold/15 transition'
              >
                Export CSV
              </a>
            </div>

            <ToastActionForm className='grid gap-4 sm:grid-cols-4 bg-black/40 border border-white/5 p-5 rounded-2xl' action={addJobMileageLogActionState}>
              <label className='text-xs font-bold text-zinc-400'>
                One-way miles
                <input 
                  name='milesOneWay' 
                  type='number' 
                  step='0.1' 
                  min='0.1' 
                  required 
                  placeholder="0.0"
                  className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-gold/50 outline-none transition' 
                />
              </label>
              <label className='text-xs font-bold text-zinc-400'>
                Trip Mode
                <select name='tripMode' defaultValue='round_trip' className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-gold/50 outline-none transition'>
                  <option value='round_trip'>Round-trip (×2)</option>
                  <option value='one_way'>One-way only</option>
                </select>
              </label>
              <label className='text-xs font-bold text-zinc-400 sm:col-span-2'>
                Appointment ID (Optional backlink)
                <input 
                  name='appointmentId' 
                  placeholder="Paste UUID if linking to specific job"
                  className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white font-mono text-[11px] focus:border-gold/50 outline-none transition' 
                />
              </label>
              <label className='text-xs font-bold text-zinc-400'>
                Date
                <input 
                  name='loggedOn' 
                  type='date' 
                  className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-gold/50 outline-none transition' 
                />
              </label>
              <label className='text-xs font-bold text-zinc-400 sm:col-span-2'>
                Note / Destination
                <input 
                  name='note' 
                  placeholder="e.g., Driveway service west Austin client"
                  className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-gold/50 outline-none transition' 
                />
              </label>
              <div className='flex items-end'>
                <SubmitStatusButton pendingText='Logging…' className='w-full rounded-xl bg-gold px-5 py-2.5 text-xs font-black uppercase text-black hover:brightness-110 transition'>
                  Log Miles
                </SubmitStatusButton>
              </div>
            </ToastActionForm>

            <div className="space-y-4">
              <p className="text-xs font-black uppercase tracking-wider text-zinc-500">Logged Travels</p>
              <div className="space-y-4">
                {mileage.length === 0 ? (
                  <p className='text-xs text-zinc-500 italic py-6 text-center border border-dashed border-white/10 rounded-xl'>No miles logged in this range.</p>
                ) : (
                  mileage.slice(0, 15).map((r) => (
                    <div key={String(r.id)} className='rounded-xl border border-white/5 bg-zinc-900/25 p-4 text-xs space-y-3'>
                      <div className='flex flex-wrap items-start justify-between gap-3'>
                        <div>
                          <p className='font-bold text-white text-sm'>{String(r.customer_name ?? 'Field Mileage')}</p>
                          <p className='text-[10px] text-zinc-500 mt-0.5'>{String(r.appointment_label ?? '—')}</p>
                          <p className='text-xs text-zinc-400 mt-1'>{String(r.vehicle ?? 'No vehicle specified')} · {String(r.address ?? '')}</p>
                          <p className='text-[10px] text-zinc-500 mt-1'>Logged {String(r.logged_date ?? r.logged_at ?? '').slice(0, 10)}</p>
                        </div>
                        <div className="text-right">
                          <p className='font-mono font-black text-gold-soft text-base'>
                            {String(r.round_trip_miles ?? (Number(r.miles_one_way ?? 0) * 2))} mi
                          </p>
                          <span className="text-[9px] font-mono text-zinc-500 block">
                            (One-way: {String(r.miles_one_way ?? '—')} mi)
                          </span>
                          {typeof r.work_order_href === 'string' && r.work_order_href && (
                            <a href={r.work_order_href} className='mt-2 inline-flex items-center gap-1 text-[9px] font-black uppercase text-gold hover:underline'>
                              Work Order <ChevronRight className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* inline edit form */}
                      <ToastActionForm action={updateJobMileageLogActionState} className='grid gap-2 border-t border-white/5 pt-3 sm:grid-cols-5 text-xs'>
                        <input type='hidden' name='id' value={String(r.id)} />
                        <label className='text-[10px] text-zinc-500 font-bold uppercase sm:col-span-2'>
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
                            className='mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white'
                          />
                        </label>
                        <label className='text-[10px] text-zinc-500 font-bold uppercase'>
                          Trip Mode
                          <select name='tripMode' defaultValue={String(r.trip_mode ?? 'round_trip')} className='mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white'>
                            <option value='round_trip'>Round-trip</option>
                            <option value='one_way'>One-way</option>
                          </select>
                        </label>
                        <label className='text-[10px] text-zinc-500 font-bold uppercase sm:col-span-2'>
                          Note
                          <input name='note' defaultValue={String(r.notes ?? '')} className='mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white' />
                        </label>
                        
                        <div className='flex items-center justify-between sm:col-span-5 pt-2 border-t border-white/5'>
                          <SubmitStatusButton pendingText='saving…' className='rounded-lg bg-gold/15 border border-gold/30 px-3 py-1 text-[9px] font-black uppercase text-gold-soft hover:bg-gold/25 transition'>
                            Save Log
                          </SubmitStatusButton>
                          
                          <ToastActionForm action={deleteJobMileageLogActionState} className='inline'>
                            <input type='hidden' name='id' value={String(r.id)} />
                            <SubmitStatusButton pendingText='deleting…' className='text-[10px] font-black uppercase text-rose-400/80 hover:text-rose-300 transition'>
                              Delete Log
                            </SubmitStatusButton>
                          </ToastActionForm>
                        </div>
                      </ToastActionForm>
                    </div>
                  ))
                )}
              </div>
            </div>
          </GlassCard>
        </>
      ) : null}
    </div>
  );
}
