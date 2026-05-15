import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

type AgreementRow = {
  id: string;
  appointment_id: string;
  signer_legal_name: string;
  signed_at: string;
  source: string;
};

export default async function AdminAgreementsPage() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();

  let rows: AgreementRow[] = [];

  if (supabase) {
    const { data: signed } = await supabase
      .from('signed_agreements')
      .select('id, appointment_id, signer_legal_name, signed_at')
      .order('signed_at', { ascending: false })
      .limit(100);
    for (const r of signed ?? []) {
      const row = r as Record<string, unknown>;
      rows.push({
        id: String(row.id),
        appointment_id: String(row.appointment_id),
        signer_legal_name: String(row.signer_legal_name ?? ''),
        signed_at: String(row.signed_at ?? ''),
        source: 'signed_agreements',
      });
    }
  }

  try {
    const admin = tryCreateAdminSupabase();
    if (admin) {
      const { data: jobAg } = await admin
        .from('job_agreements')
        .select('id, appointment_id, signer_legal_name, signed_at')
        .order('signed_at', { ascending: false })
        .limit(100);
      for (const r of jobAg ?? []) {
        const row = r as Record<string, unknown>;
        if (rows.some((x) => x.appointment_id === String(row.appointment_id))) continue;
        rows.push({
          id: String(row.id),
          appointment_id: String(row.appointment_id),
          signer_legal_name: String(row.signer_legal_name ?? ''),
          signed_at: String(row.signed_at ?? ''),
          source: 'job_agreements',
        });
      }
    }
  } catch {
    /* table may not exist */
  }

  rows.sort((a, b) => (a.signed_at < b.signed_at ? 1 : -1));

  return (
    <DashboardShell title='Signed agreements' subtitle='Search and open customer liability acknowledgements.' role='admin'>
      <Link href='/admin/cms' className='mb-4 inline-block text-xs font-bold uppercase tracking-wider text-gold-soft underline'>
        ← CMS
      </Link>

      {rows.length === 0 ? (
        <p className='rounded-2xl border border-white/10 bg-zinc-950 p-6 text-sm text-zinc-400'>No signed agreements yet.</p>
      ) : (
        <ul className='space-y-2'>
          {rows.map((a) => (
            <li key={`${a.source}-${a.id}`} className='flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-zinc-950 px-4 py-3'>
              <div>
                <p className='font-semibold text-white'>{a.signer_legal_name}</p>
                <p className='text-xs text-zinc-500'>
                  {new Date(a.signed_at).toLocaleString()} · appt {a.appointment_id.slice(0, 8)}…
                </p>
              </div>
              <span className='text-[10px] uppercase text-zinc-600'>{a.source}</span>
            </li>
          ))}
        </ul>
      )}
    </DashboardShell>
  );
}
