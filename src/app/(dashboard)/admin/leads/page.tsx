import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function AdminLeadsPage() {
  let rows: Record<string, unknown>[] = [];
  let err: string | null = null;
  const admin = tryCreateAdminSupabase();
  if (admin) {
    const { data, error } = await admin.from('leads').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) err = error.message;
    else rows = (data ?? []) as Record<string, unknown>[];
  }

  return (
    <DashboardShell title='Leads' subtitle='Field and web leads — mini CRM.' role='admin'>
      <Link href='/admin/super' className='mb-4 inline-block text-xs font-bold uppercase text-gold-soft underline'>
        ← Command center
      </Link>
      {err ? <p className='mb-4 text-sm text-amber-200'>Run migration 000016: {err}</p> : null}
      <ul className='space-y-2'>
        {rows.map((r) => (
          <li key={String(r.id)} className='rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm'>
            <p className='font-bold text-white'>{String(r.name)}</p>
            <p className='text-xs text-zinc-500'>
              {String(r.status)} · {String(r.lead_source ?? '')} · {r.created_at ? new Date(String(r.created_at)).toLocaleString() : ''}
            </p>
            {r.phone ? <p className='text-zinc-400'>{String(r.phone)}</p> : null}
            {r.notes ? <p className='text-zinc-500'>{String(r.notes)}</p> : null}
          </li>
        ))}
      </ul>
    </DashboardShell>
  );
}
