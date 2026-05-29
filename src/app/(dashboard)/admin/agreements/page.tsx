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



  return (

    <DashboardShell title='Agreements & Intake' subtitle='Unified liability acknowledgements, signed agreements, and intake submissions.' role='admin'>

      <Link href='/admin/cms' className='mb-4 inline-block text-xs font-bold uppercase tracking-wider text-gold-soft underline'>

        ← CMS

      </Link>



      {rows.length === 0 ? (

        <p className='rounded-2xl border border-white/10 bg-zinc-950 p-6 text-sm text-zinc-400'>No signed agreements yet.</p>

      ) : (

        <ul className='space-y-2'>

          {rows.map((a) => (

            <li key={`${a.source}-${a.id}`} className='flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-zinc-950 px-4 py-3'>

              <div className='min-w-0 flex-1'>

                <p className='font-semibold text-white'>{a.customerLabel}</p>

                <p className='mt-1 text-xs text-zinc-400'>{a.vehicleLabel}</p>

                <p className='mt-1 text-xs text-gold-soft'>

                  {a.serviceLabel} · {a.dateLabel} · <span className='uppercase'>{a.statusLabel}</span>

                </p>

              </div>

              <div className='flex flex-wrap items-center gap-2'>

                <span className='text-[10px] uppercase text-zinc-600'>{a.source}</span>

                <Link href={`/admin/agreements/${encodeURIComponent(`${a.source}:${a.id}`)}`} className='rounded border border-gold/30 px-3 py-1 text-[10px] font-bold uppercase text-gold-soft'>View</Link>

                <form action={archiveAgreementAction}>

                  <input type='hidden' name='id' value={a.id} />

                  <input type='hidden' name='source' value={a.source} />

                  <ConfirmSubmitButton message='Archive this agreement?' className='rounded border border-amber-500/30 px-3 py-1 text-[10px] font-bold uppercase text-amber-200'>Archive</ConfirmSubmitButton>

                </form>

                <form action={deleteAgreementAction}>

                  <input type='hidden' name='id' value={a.id} />

                  <input type='hidden' name='source' value={a.source} />

                  <ConfirmSubmitButton message='Delete this agreement?' className='rounded border border-red-500/30 px-3 py-1 text-[10px] font-bold uppercase text-red-200'>Delete</ConfirmSubmitButton>

                </form>

              </div>

            </li>

          ))}

        </ul>

      )}

    </DashboardShell>

  );

}

