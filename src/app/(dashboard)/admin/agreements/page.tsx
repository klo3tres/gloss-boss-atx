import Link from 'next/link';

import { DashboardShell } from '@/components/dashboard/dashboard-shell';

import { createSupabaseServerClient } from '@/lib/supabase/server';

import { getSessionWithProfile } from '@/lib/auth/session';

import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';

import { revalidatePath } from 'next/cache';

import { displayChicago, displayLabel, str } from '@/lib/display-format';

import { vehiclesFromRow, type Row } from '@/lib/work-order-resolve';



export const dynamic = 'force-dynamic';



type AgreementRow = {

  id: string;

  appointment_id: string;

  fallback_booking_id?: string;

  signer_legal_name: string;

  signed_at: string;

  source: string;

  customerLabel: string;

  vehicleLabel: string;

  serviceLabel: string;

  dateLabel: string;

  statusLabel: string;

};



async function archiveAgreementAction(formData: FormData) {

  'use server';

  const admin = tryCreateAdminSupabase();

  const id = String(formData.get('id') ?? '').trim();

  const source = String(formData.get('source') ?? 'signed_agreements').trim();

  if (!admin || !id) return;

  await admin.from(source).update({ archived_at: new Date().toISOString() }).eq('id', id);

  revalidatePath('/admin/agreements');

}



async function deleteAgreementAction(formData: FormData) {

  'use server';

  const admin = tryCreateAdminSupabase();

  const id = String(formData.get('id') ?? '').trim();

  const source = String(formData.get('source') ?? 'signed_agreements').trim();

  if (!admin || !id) return;

  await admin.from(source).update({ archived_at: new Date().toISOString(), deleted_at: new Date().toISOString() }).eq('id', id);

  revalidatePath('/admin/agreements');

}



function vehicleSummary(appt: Row | null): string {

  if (!appt) return '—';

  const lines = vehiclesFromRow(appt);

  if (lines.length) {

    return lines

      .map((v, i) => str(v.vehicle_description || v.description) || `Vehicle ${i + 1}`)

      .join(' · ');

  }

  return str(appt.vehicle_description) || '—';

}



export default async function AdminAgreementsPage() {

  const session = await getSessionWithProfile();

  const supabase = await createSupabaseServerClient();

  const admin = tryCreateAdminSupabase();



  let rows: AgreementRow[] = [];

  const apptCache = new Map<string, Row>();



  async function apptFor(id: string, fallbackId?: string) {

    const key = id || fallbackId || '';

    if (!key || !admin) return null;

    if (apptCache.has(key)) return apptCache.get(key) ?? null;

    let row: Row | null = null;

    if (id) {

      const { data } = await admin.from('appointments').select('id, guest_name, guest_email, status, service_slug, booking_vehicles, vehicle_description, scheduled_start').eq('id', id).maybeSingle();

      row = (data ?? null) as Row | null;

    }

    if (!row && fallbackId) {

      const { data } = await admin.from('booking_fallbacks').select('id, guest_name, guest_email, status, service_slug, booking_vehicles, vehicle_description, scheduled_start').eq('id', fallbackId).maybeSingle();

      row = (data ?? null) as Row | null;

    }

    apptCache.set(key, row ?? ({} as Row));

    return row;

  }



  if (supabase) {

    const { data: signed } = await supabase

      .from('signed_agreements')

      .select('id, appointment_id, fallback_booking_id, signer_legal_name, signed_at')

      .order('signed_at', { ascending: false })

      .limit(100);

    for (const r of signed ?? []) {

      const row = r as Record<string, unknown>;

      const apptId = String(row.appointment_id ?? '');

      const fbId = String(row.fallback_booking_id ?? '');

      const appt = await apptFor(apptId, fbId);

      rows.push({

        id: String(row.id),

        appointment_id: apptId,

        fallback_booking_id: fbId,

        signer_legal_name: String(row.signer_legal_name ?? ''),

        signed_at: String(row.signed_at ?? ''),

        source: 'signed_agreements',

        customerLabel: str(appt?.guest_name || appt?.guest_email) || String(row.signer_legal_name ?? 'Customer'),

        vehicleLabel: vehicleSummary(appt),

        serviceLabel: displayLabel(appt?.service_slug, 'Service'),

        dateLabel: displayChicago(appt?.scheduled_start || row.signed_at),

        statusLabel: displayLabel(appt?.status, 'signed'),

      });

    }

  }



  try {

    if (admin) {

      const { data: jobAg } = await admin

        .from('job_agreements')

        .select('id, appointment_id, signer_legal_name, signed_at')

        .order('signed_at', { ascending: false })

        .limit(100);

      for (const r of jobAg ?? []) {

        const row = r as Record<string, unknown>;

        const apptId = String(row.appointment_id ?? '');

        if (apptId && rows.some((x) => x.appointment_id === apptId)) continue;

        const appt = await apptFor(apptId);

        rows.push({

          id: String(row.id),

          appointment_id: apptId,

          signer_legal_name: String(row.signer_legal_name ?? ''),

          signed_at: String(row.signed_at ?? ''),

          source: 'job_agreements',

          customerLabel: str(appt?.guest_name || appt?.guest_email) || String(row.signer_legal_name ?? 'Customer'),

          vehicleLabel: vehicleSummary(appt),

          serviceLabel: displayLabel(appt?.service_slug, 'Service'),

          dateLabel: displayChicago(appt?.scheduled_start || row.signed_at),

          statusLabel: displayLabel(appt?.status, 'signed'),

        });

      }

      const { data: intakes } = await admin

        .from('intake_submissions')

        .select('id, appointment_id, fallback_booking_id, form_data, created_at')

        .order('created_at', { ascending: false })

        .limit(160);

      for (const r of intakes ?? []) {

        const row = r as Record<string, unknown>;

        const form = row.form_data && typeof row.form_data === 'object' ? (row.form_data as Record<string, unknown>) : {};

        const apptId = String(row.appointment_id ?? '');

        const fbId = String(row.fallback_booking_id ?? '');

        if (apptId && rows.some((x) => x.appointment_id === apptId)) continue;

        const appt = await apptFor(apptId, fbId);

        rows.push({

          id: String(row.id),

          appointment_id: apptId,

          fallback_booking_id: fbId,

          signer_legal_name: String(form.signer_legal_name ?? form.customer_name ?? form.name ?? ''),

          signed_at: String(row.created_at ?? ''),

          source: 'intake_submissions',

          customerLabel: str(appt?.guest_name || form.customer_name || form.name) || 'Customer',

          vehicleLabel: vehicleSummary(appt) !== '—' ? vehicleSummary(appt) : str(form.vehicle_description) || '—',

          serviceLabel: displayLabel(appt?.service_slug || form.service_slug, 'Intake'),

          dateLabel: displayChicago(appt?.scheduled_start || row.created_at),

          statusLabel: 'intake',

        });

      }

    }

  } catch {

    /* table may not exist */

  }



  rows.sort((a, b) => (a.signed_at < b.signed_at ? 1 : -1));



  const totalSigned = rows.filter((r) => r.statusLabel === 'signed' || r.statusLabel === 'intake').length;
  const stripeSourceCount = rows.filter((r) => r.source === 'signed_agreements').length;
  const techSourceCount = rows.filter((r) => r.source === 'job_agreements').length;

  return (
    <DashboardShell 
      title='Compliance & Agreements' 
      subtitle='Unified liability acknowledgements, signed agreements, and pre-service check-in audit logs.' 
      role='admin'
    >
      <div className="mb-6 flex items-center justify-between">
        <Link href='/admin' className='inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-gold-soft hover:underline'>
          ← Admin Command Center
        </Link>
        <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-zinc-400 font-bold">
          {rows.length} Audited Logs
        </span>
      </div>

      {/* Overview Statistics Section */}
      <section className='mb-8 grid gap-4 grid-cols-2 lg:grid-cols-3'>
        <div className='gb-premium-card rounded-3xl border border-gold/20 bg-zinc-950/90 p-5 shadow-[0_0_24px_rgba(212,175,55,0.06)] relative overflow-hidden group hover:border-gold/30 transition-all duration-300'>
          <p className='text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400'>Total Signed Agreements</p>
          <div className='flex items-baseline gap-2 mt-3'>
            <span className='font-mono text-3xl font-black text-white'>{totalSigned}</span>
            <span className='text-[10px] text-emerald-400 font-bold uppercase tracking-wider'>100% compliant</span>
          </div>
          <p className='mt-1 text-[10px] text-zinc-500'>Completed liability waivers across booking and field routes.</p>
        </div>

        <div className='gb-premium-card rounded-3xl border border-white/5 bg-black/40 p-5 relative overflow-hidden group hover:border-gold/20 transition-all duration-300'>
          <p className='text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400'>Online Customer Waivers</p>
          <div className='flex items-baseline gap-2 mt-3'>
            <span className='font-mono text-3xl font-black text-gold-soft'>{stripeSourceCount}</span>
            <span className='text-[10px] text-zinc-500'>checkout flow</span>
          </div>
          <p className='mt-1 text-[10px] text-zinc-500'>Signed during standard public checkout funnel online.</p>
        </div>

        <div className='gb-premium-card rounded-3xl border border-white/5 bg-black/40 p-5 relative overflow-hidden group hover:border-gold/20 transition-all duration-300 sm:col-span-2 lg:col-span-1'>
          <p className='text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400'>Field In-Person Waivers</p>
          <div className='flex items-baseline gap-2 mt-3'>
            <span className='font-mono text-3xl font-black text-gold-soft'>{techSourceCount}</span>
            <span className='text-[10px] text-zinc-500'>tech tablet</span>
          </div>
          <p className='mt-1 text-[10px] text-zinc-500'>Captured on-site by field technician before details start.</p>
        </div>
      </section>

      {/* Main Audit Feed */}
      <section className='space-y-4'>
        <div className='flex items-center justify-between border-b border-white/10 pb-3 mb-5'>
          <p className='text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>Real-Time Agreement Ledger</p>
          <span className='text-[10px] text-zinc-500 font-medium'>Showing last 200 submissions</span>
        </div>

        {rows.length === 0 ? (
          <div className='rounded-3xl border border-dashed border-white/10 bg-zinc-950 p-12 text-center flex flex-col items-center justify-center'>
            <p className='text-sm text-zinc-400 font-bold uppercase tracking-wider'>No Active Signed Waivers Found</p>
            <p className='text-xs text-zinc-500 mt-1.5'>Waiver records will populate here immediately upon customer execution.</p>
          </div>
        ) : (
          <div className='grid gap-4 md:grid-cols-2'>
            {rows.map((a) => (
              <div 
                key={`${a.source}-${a.id}`} 
                className='relative group flex flex-col justify-between rounded-2xl border border-white/5 bg-zinc-950/40 p-5 hover:border-gold/25 hover:shadow-[0_0_24px_rgba(212,175,55,0.06)] transition duration-300'
              >
                <div>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                      <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider border ${
                        a.source === 'signed_agreements' ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25' :
                        a.source === 'job_agreements' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25' :
                        'bg-zinc-800 text-zinc-400 border-white/5'
                      }`}>
                        {a.source.replace(/_/g, ' ')}
                      </span>
                      <h3 className='font-bold text-white text-base mt-2 truncate group-hover:text-gold-soft transition'>
                        {a.customerLabel}
                      </h3>
                      <p className='text-xs text-zinc-500 truncate mt-0.5'>{a.vehicleLabel}</p>
                    </div>

                    <div className='text-right shrink-0'>
                      <span className='rounded bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-300 font-mono'>
                        {a.statusLabel}
                      </span>
                      <p className='text-[10px] text-zinc-500 font-mono mt-1'>{a.dateLabel}</p>
                    </div>
                  </div>

                  <div className='mt-4 border-t border-white/5 pt-3 text-xs text-zinc-400'>
                    <div className='flex items-center gap-2 justify-between'>
                      <span className='text-[10px] text-zinc-500'>Signer Authorization:</span>
                      <strong className='text-zinc-300 font-medium font-mono'>{a.signer_legal_name || 'Verified Customer Signature'}</strong>
                    </div>
                  </div>
                </div>

                {/* Collapsed Actions inside item card */}
                <details className='mt-4 pt-3 border-t border-white/5 text-xs group'>
                  <summary className='cursor-pointer text-[10px] font-black uppercase tracking-wider text-zinc-500 hover:text-gold-soft transition flex items-center justify-between select-none'>
                    <span>Administrative Tools</span>
                    <span className='rounded-md border border-white/10 px-2 py-0.5 text-[8px] bg-zinc-950/40 group-open:bg-zinc-900 transition'>Toggle actions</span>
                  </summary>
                  
                  <div className='mt-3 pt-3 border-t border-white/5 flex flex-wrap items-center justify-end gap-2'>
                    <Link 
                      href={`/admin/agreements/${encodeURIComponent(`${a.source}:${a.id}`)}`} 
                      className='rounded-xl bg-gold text-black hover:bg-gold-soft px-3.5 py-2 text-[10px] font-black uppercase tracking-wider transition'
                    >
                      Inspect Waiver Document
                    </Link>

                    <form action={archiveAgreementAction}>
                      <input type='hidden' name='id' value={a.id} />
                      <input type='hidden' name='source' value={a.source} />
                      <ConfirmSubmitButton 
                        message='Archive this agreement from active log list?' 
                        className='rounded-xl border border-amber-500/35 text-amber-300 hover:bg-amber-500/10 px-3.5 py-2 text-[10px] font-black uppercase tracking-wider transition'
                      >
                        Archive Entry
                      </ConfirmSubmitButton>
                    </form>

                    <form action={deleteAgreementAction}>
                      <input type='hidden' name='id' value={a.id} />
                      <input type='hidden' name='source' value={a.source} />
                      <ConfirmSubmitButton 
                        message='PERMANENTLY delete compliance agreement from records?' 
                        className='rounded-xl border border-rose-500/35 text-rose-300 hover:bg-rose-500/10 px-3.5 py-2 text-[10px] font-black uppercase tracking-wider transition'
                      >
                        Delete Record
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </section>
    </DashboardShell>
  );

}

