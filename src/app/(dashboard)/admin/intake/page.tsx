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

  const totalSubmissions = rows.length;

  return (
    <DashboardShell 
      title='Intake & Pre-Service Forms' 
      subtitle='Customer check-in details, vehicle pre-inspection records, and liability authorization logs.' 
      role='admin'
    >
      <div className="mb-6 flex items-center justify-between">
        <Link href='/admin' className='inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-gold-soft hover:underline'>
          ← Admin Command Center
        </Link>
        <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-zinc-400 font-bold">
          {totalSubmissions} Submitted Check-ins
        </span>
      </div>

      {err ? (
        <p className='mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100'>{err}</p>
      ) : null}

      {rows.length === 0 ? (
        <div className='rounded-3xl border border-dashed border-white/10 bg-zinc-950 p-12 text-center flex flex-col items-center justify-center'>
          <p className='text-sm text-zinc-400 font-bold uppercase tracking-wider'>No Intake Submissions Registered</p>
          <p className='text-xs text-zinc-500 mt-1.5'>Vehicle pre-check forms will appear here automatically when clients submit post-booking details.</p>
        </div>
      ) : (
        <div className='grid gap-6'>
          {rows.map((r) => {
            const dateStr = new Date(r.created_at).toLocaleString('en-US', {
              dateStyle: 'medium',
              timeStyle: 'short',
            });

            return (
              <div 
                key={r.id} 
                className='gb-premium-card rounded-3xl border border-white/5 bg-zinc-950/45 p-6 shadow-xl hover:border-gold/20 transition duration-300'
              >
                <div className='flex flex-wrap items-start justify-between gap-4 border-b border-white/5 pb-4 mb-4'>
                  <div>
                    <div className='flex items-center gap-2'>
                      <span className='rounded bg-gold/15 border border-gold/25 px-2.5 py-0.5 text-[9px] font-black uppercase text-gold-soft font-mono'>
                        Pre-Service File
                      </span>
                      <span className='text-[10px] text-zinc-500 font-mono'>ID: #{r.id.slice(0, 8)}</span>
                    </div>
                    <p className='text-xs text-zinc-400 mt-1.5'>
                      Submitted: <strong className='text-zinc-200 font-medium'>{dateStr}</strong>
                    </p>
                  </div>

                  <div className='flex items-center gap-2'>
                    <Link 
                      href={`/admin/work-orders/${r.appointment_id}`}
                      className='rounded-xl bg-zinc-900 border border-white/5 hover:border-gold/30 hover:bg-gold/5 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-zinc-300 transition'
                    >
                      Inspect Appointment
                    </Link>
                  </div>
                </div>

                {/* Structured form variables list */}
                <div className='grid gap-4 sm:grid-cols-2 md:grid-cols-3 mb-5'>
                  {Object.entries(r.form_data).map(([key, value]) => {
                    const cleanKey = key.replace(/_/g, ' ');
                    const displayVal = typeof value === 'object' ? JSON.stringify(value) : String(value);

                    // Skip signature fields as they are shown prominently below
                    if (key.includes('signature') || key.includes('signer')) return null;

                    return (
                      <div key={key} className='rounded-xl border border-white/5 bg-black/35 p-3'>
                        <span className='text-[9px] text-zinc-500 uppercase font-black tracking-wider block capitalize'>
                          {cleanKey}
                        </span>
                        <strong className='text-xs text-zinc-200 font-medium mt-1 block break-words'>
                          {displayVal || '—'}
                        </strong>
                      </div>
                    );
                  })}
                </div>

                {/* Signature status overlay */}
                {r.signature_text && (
                  <div className='rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-4 flex flex-wrap items-center justify-between gap-3'>
                    <div className='flex items-center gap-2.5'>
                      <div className='h-2 w-2 rounded-full bg-emerald-400 animate-pulse' />
                      <span className='text-xs text-emerald-200 font-bold uppercase tracking-wider'>
                        Liability Sign-Off Verification
                      </span>
                    </div>
                    <p className='text-xs font-mono font-bold text-zinc-300'>
                      Authorized Signature: <span className='text-white underline italic font-serif'>{r.signature_text}</span>
                    </p>
                  </div>
                )}

                {/* Collapsed raw JSON representation */}
                <details className='mt-5 pt-3 border-t border-white/5 text-xs group'>
                  <summary className='cursor-pointer text-[10px] font-black uppercase tracking-wider text-zinc-500 hover:text-gold-soft transition flex items-center justify-between select-none'>
                    <span>Raw JSON Submission Payload</span>
                    <span className='rounded-md border border-white/10 px-2 py-0.5 text-[8px] bg-zinc-950/40 group-open:bg-zinc-900 transition'>Toggle payload</span>
                  </summary>
                  
                  <div className='mt-3 pt-3 border-t border-white/5'>
                    <pre className='overflow-x-auto text-[10px] font-mono text-zinc-400 bg-black/60 p-4 rounded-xl border border-white/5 leading-relaxed'>
                      {JSON.stringify(r.form_data, null, 2)}
                    </pre>
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </DashboardShell>
  );
}
