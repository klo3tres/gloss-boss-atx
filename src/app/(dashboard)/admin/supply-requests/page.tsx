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
            <article key={row.id} className='rounded-3xl border border-gold/15 bg-zinc-950/90 p-5'>
              <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
                <div className='min-w-0'>
                  <p className='flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft'>
                    <Icon className='h-4 w-4' /> {status}
                  </p>
                  <h2 className='mt-2 text-lg font-black text-white'>{requestText(row)}</h2>
                  <p className='mt-1 text-xs text-zinc-500'>
                    {profiles.get(String(row.created_by ?? '')) ?? 'Technician'} · {when(row.incurred_at ?? row.created_at)}
                  </p>
                  {managerNote(row) ? <p className='mt-3 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs text-zinc-300'>{managerNote(row)}</p> : null}
                </div>
                <form action={updateSupplyRequestAction} className='flex flex-col gap-2 min-w-[320px]'>
                  <input type='hidden' name='id' value={row.id} />
                  <input type='hidden' name='existingNotes' value={row.notes ?? ''} />
                  <input name='managerNote' placeholder='Add a manager note before acting...' className='w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white' />
                  <div className='flex flex-wrap gap-2 mt-1 justify-end'>
                    {status !== 'ordered' && status !== 'fulfilled' && (
                      <button name="status" value="ordered" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[10px] font-black uppercase text-amber-200 hover:bg-amber-500/20 transition duration-200">
                        Order / Purchase
                      </button>
                    )}
                    {status !== 'fulfilled' && (
                      <button name="status" value="fulfilled" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black uppercase text-emerald-200 hover:bg-emerald-500/20 transition duration-200">
                        Deliver / Fulfill
                      </button>
                    )}
                    {status !== 'denied' && (
                      <button name="status" value="denied" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-black uppercase text-red-200 hover:bg-red-500/20 transition duration-200">
                        Deny
                      </button>
                    )}
                    {status !== 'new' && (
                      <button name="status" value="new" className="rounded-lg border border-zinc-500/30 bg-zinc-500/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-300 hover:bg-zinc-500/20 transition duration-200">
                        Re-Open
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </article>
          );
        })}
      </section>
    </DashboardShell>
  );
}
