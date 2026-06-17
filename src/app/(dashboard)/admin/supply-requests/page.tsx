import { notFound } from 'next/navigation';
import { PackageOpen, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { updateSupplyRequestAction } from './actions';

export const dynamic = 'force-dynamic';

type SupplyRow = {
  id: string;
  category?: string | null;
  amount_cents?: number | null;
  notes?: string | null;
  created_by?: string | null;
  incurred_at?: string | null;
  created_at?: string | null;
};

function statusFor(row: SupplyRow) {
  const note = String(row.notes ?? '').toLowerCase();
  const cat = String(row.category ?? '').toLowerCase();
  if (cat.includes('fulfilled') || note.includes('[manager:fulfilled')) return 'fulfilled';
  if (cat.includes('denied') || note.includes('[manager:denied')) return 'denied';
  if (note.includes('[manager:ordered')) return 'ordered';
  return 'new';
}

function requestText(row: SupplyRow) {
  const note = String(row.notes ?? '');
  const match = note.match(/Supply Request by tech:\s*([\s\S]*?)(?:\.\s*Notes:|\n\[manager:|$)/i);
  return (match?.[1] ?? note).replace(/\[manager:[^\]]+\]/g, '').trim() || 'Supply request';
}

function managerNote(row: SupplyRow) {
  const match = String(row.notes ?? '').match(/\[manager:([^\]]+)\]/i);
  return match?.[1] ?? '';
}

function when(v?: string | null) {
  if (!v) return 'No date';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(v));
}

export default async function AdminSupplyRequestsPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) notFound();

  const [requestRes, profileRes] = await Promise.all([
    admin
      .from('business_expenses')
      .select('id, category, amount_cents, notes, created_by, incurred_at, created_at')
      .or('category.ilike.%supply%,notes.ilike.%Supply Request by tech%')
      .order('created_at', { ascending: false })
      .limit(200),
    admin.from('profiles').select('id, full_name, email').limit(500),
  ]);

  const profiles = new Map(
    ((profileRes.data ?? []) as Array<{ id: string; full_name?: string | null; email?: string | null }>).map((p) => [
      p.id,
      p.full_name || p.email || 'Technician',
    ]),
  );
  const rows = ((requestRes.data ?? []) as SupplyRow[]).filter((r) =>
    String(r.category ?? '').toLowerCase().includes('supply') || String(r.notes ?? '').includes('Supply Request by tech'),
  );
  const open = rows.filter((r) => ['new', 'ordered'].includes(statusFor(r))).length;
  const fulfilled = rows.filter((r) => statusFor(r) === 'fulfilled').length;

  return (
    <DashboardShell title='Supply requests' subtitle='Technician-submitted product, chemical, towel, tool, and restock requests.' role='admin'>
      {requestRes.error ? (
        <p className='rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100'>
          Supply inbox could not load: {requestRes.error.message}
        </p>
      ) : null}

      <section className='grid gap-4 sm:grid-cols-3'>
        <div className='rounded-2xl border border-gold/20 bg-black/45 p-5'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Open requests</p>
          <p className='mt-2 text-3xl font-black text-white'>{open}</p>
        </div>
        <div className='rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-emerald-200'>Fulfilled</p>
          <p className='mt-2 text-3xl font-black text-white'>{fulfilled}</p>
        </div>
        <div className='rounded-2xl border border-white/10 bg-zinc-950 p-5'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-zinc-400'>Source</p>
          <p className='mt-2 text-sm text-zinc-300'>Real technician requests from the field portal.</p>
        </div>
      </section>

      <section className='grid gap-4'>
        {rows.length === 0 ? (
          <div className='rounded-3xl border border-dashed border-white/10 bg-black/35 p-10 text-center'>
            <PackageOpen className='mx-auto h-8 w-8 text-gold-soft' />
            <p className='mt-3 text-sm text-zinc-400'>No supply requests have been submitted yet.</p>
          </div>
        ) : null}
        {rows.map((row) => {
          const status = statusFor(row);
          const Icon = status === 'fulfilled' ? CheckCircle2 : status === 'denied' ? XCircle : Clock;
          return (
            <article key={row.id} className='gb-premium-card rounded-3xl border border-white/5 bg-zinc-950/45 p-6 hover:border-gold/25 hover:shadow-[0_0_24px_rgba(212,175,55,0.06)] transition duration-300'>
              <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
                <div className='min-w-0 flex-1 space-y-2'>
                  <div className='flex items-center gap-2'>
                    <span className={`rounded-full px-2.5 py-0.5 text-[8px] font-black uppercase border tracking-wider flex items-center gap-1 ${
                      status === 'fulfilled' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25' :
                      status === 'denied' ? 'bg-rose-500/10 text-rose-300 border-rose-500/25' :
                      status === 'ordered' ? 'bg-amber-500/10 text-amber-300 border-amber-500/25' :
                      'bg-zinc-800 text-zinc-400 border-white/5'
                    }`}>
                      <Icon className='h-3.5 w-3.5' /> {status}
                    </span>
                    <span className='text-[10px] text-zinc-500 font-mono'>Request #{row.id.slice(0, 8)}</span>
                  </div>
                  <h2 className='text-lg font-black text-white leading-tight'>{requestText(row)}</h2>
                  <p className='text-xs text-zinc-500'>
                    Requested by: <strong className='text-zinc-300 font-medium'>{profiles.get(String(row.created_by ?? '')) ?? 'Technician'}</strong> · {when(row.incurred_at ?? row.created_at)}
                  </p>
                  {managerNote(row) ? (
                    <div className='rounded-xl border border-white/5 bg-black/45 px-3 py-2.5 text-xs text-zinc-300 leading-relaxed max-w-xl'>
                      <span className='text-[8px] font-black uppercase text-gold-soft tracking-wider block mb-1'>Manager Log:</span>
                      {managerNote(row)}
                    </div>
                  ) : null}
                </div>

                {/* Collapsed Admin Actions */}
                <details className='mt-4 lg:mt-0 lg:ml-4 flex-shrink-0 min-w-full lg:min-w-[320px] rounded-2xl border border-white/5 bg-black/40 p-4 group text-xs'>
                  <summary className='cursor-pointer text-[10px] font-black uppercase tracking-wider text-zinc-500 hover:text-gold-soft transition flex items-center justify-between select-none'>
                    <span>Action Dashboard</span>
                    <span className='rounded-md border border-white/10 px-2 py-0.5 text-[8px] bg-zinc-950/40 group-open:bg-zinc-900 transition'>Toggle Panel</span>
                  </summary>
                  
                  <form action={updateSupplyRequestAction} className='mt-4 pt-3 border-t border-white/5 flex flex-col gap-2'>
                    <input type='hidden' name='id' value={row.id} />
                    <input type='hidden' name='existingNotes' value={row.notes ?? ''} />
                    <label className='block text-[9px] uppercase font-bold text-zinc-500'>Manager Notes</label>
                    <input 
                      name='managerNote' 
                      placeholder='Add a manager note before executing...' 
                      className='w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs text-white focus:border-gold/50 outline-none transition' 
                    />
                    <div className='flex flex-wrap gap-2 mt-1 justify-end'>
                      {status !== 'ordered' && status !== 'fulfilled' && (
                        <button name="status" value="ordered" className="rounded-xl border border-amber-500/35 bg-amber-500/5 px-3.5 py-2 text-[9px] font-black uppercase text-amber-300 hover:bg-amber-500/10 transition">
                          Order / Purchase
                        </button>
                      )}
                      {status !== 'fulfilled' && (
                        <button name="status" value="fulfilled" className="rounded-xl border border-emerald-500/35 bg-emerald-500/5 px-3.5 py-2 text-[9px] font-black uppercase text-emerald-300 hover:bg-emerald-500/10 transition">
                          Deliver / Fulfill
                        </button>
                      )}
                      {status !== 'denied' && (
                        <button name="status" value="denied" className="rounded-xl border border-rose-500/35 bg-rose-500/5 px-3.5 py-2 text-[9px] font-black uppercase text-rose-300 hover:bg-rose-500/10 transition">
                          Deny Request
                        </button>
                      )}
                      {status !== 'new' && (
                        <button name="status" value="new" className="rounded-xl border border-zinc-500/35 bg-zinc-500/5 px-3.5 py-2 text-[9px] font-black uppercase text-zinc-300 hover:bg-zinc-500/10 transition">
                          Re-Open
                        </button>
                      )}
                    </div>
                  </form>
                </details>
              </div>
            </article>
          );
        })}
      </section>
    </DashboardShell>
  );
}
