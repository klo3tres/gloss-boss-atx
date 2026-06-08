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
                <form action={updateSupplyRequestAction} className='grid min-w-[260px] gap-2 sm:grid-cols-[1fr_auto]'>
                  <input type='hidden' name='id' value={row.id} />
                  <input type='hidden' name='existingNotes' value={row.notes ?? ''} />
                  <select name='status' defaultValue={status} className='rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white'>
                    <option value='new'>Needs review</option>
                    <option value='ordered'>Ordered</option>
                    <option value='fulfilled'>Fulfilled</option>
                    <option value='denied'>Denied</option>
                  </select>
                  <button className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Save</button>
                  <input name='managerNote' placeholder='Manager note' className='rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white sm:col-span-2' />
                </form>
              </div>
            </article>
          );
        })}
      </section>
    </DashboardShell>
  );
}
