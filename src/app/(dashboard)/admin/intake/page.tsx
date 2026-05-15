import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  appointment_id: string;
  form_data: Record<string, unknown>;
  created_at: string;
  signature_text?: string | null;
};

export default async function AdminIntakePage() {
  const session = await getSessionWithProfile();
  let rows: Row[] = [];
  let err: string | null = null;

  try {
    const admin = tryCreateAdminSupabase();
    if (admin) {
      const { data, error } = await admin.from('intake_submissions').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) err = error.message;
      else {
        rows = (data ?? []).map((r: Record<string, unknown>) => ({
          id: String(r.id),
          appointment_id: String(r.appointment_id),
          form_data: (r.form_data as Record<string, unknown>) ?? {},
          created_at: String(r.created_at ?? ''),
          signature_text: r.signature_text != null ? String(r.signature_text) : null,
        }));
      }
    }
  } catch (e) {
    err = e instanceof Error ? e.message : 'Load failed';
  }

  return (
    <DashboardShell title='Intake submissions' subtitle='Customer forms after checkout.' role='admin'>
      <Link href='/admin/cms' className='mb-4 inline-block text-xs font-bold uppercase text-gold-soft underline'>
        ← CMS
      </Link>
      {err ? <p className='mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100'>{err}</p> : null}
      {rows.length === 0 ? (
        <p className='text-sm text-zinc-500'>No intake submissions yet. Run migration 000015.</p>
      ) : (
        <ul className='space-y-3'>
          {rows.map((r) => (
            <li key={r.id} className='rounded-xl border border-white/10 bg-zinc-950 p-4'>
              <p className='text-xs text-zinc-500'>{new Date(r.created_at).toLocaleString()} · appt {r.appointment_id.slice(0, 8)}…</p>
              {r.signature_text ? (
                <p className='mt-1 text-xs text-gold-soft'>
                  Signature: <span className='text-zinc-200'>{r.signature_text}</span>
                </p>
              ) : null}
              <pre className='mt-2 overflow-x-auto text-xs text-zinc-300'>{JSON.stringify(r.form_data, null, 2)}</pre>
            </li>
          ))}
        </ul>
      )}
    </DashboardShell>
  );
}
