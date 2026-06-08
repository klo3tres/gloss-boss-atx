import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Building2, ExternalLink } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { DEFAULT_FLEET_PRICING, parseFleetPricing } from '@/lib/fleet-pricing';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { setFleetPricingAction, setFleetServicesSettingAction } from '../operations/fleet-actions';
import { updateFleetInquiryStatusAction } from './actions';

export const dynamic = 'force-dynamic';

type Inquiry = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string | null;
  fleet_size?: string | null;
  message?: string | null;
  status: string;
  created_at: string;
};

function when(v: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(v));
}

export default async function AdminFleetPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) notFound();

  const [settingsRes, inquiriesRes] = await Promise.all([
    admin.from('site_settings').select('key, value').in('key', ['fleet_services_enabled', 'fleet_services_blurb', 'fleet_pricing']).limit(10),
    admin.from('fleet_inquiries').select('*').order('created_at', { ascending: false }).limit(150),
  ]);

  const settings = (settingsRes.data ?? []) as Record<string, unknown>[];
  const fleetEnabled = settings.some((r) => r.key === 'fleet_services_enabled' && String(r.value).toLowerCase() === 'true');
  const fleetBlurb = String(settings.find((r) => r.key === 'fleet_services_blurb')?.value ?? '');
  const pricingRaw = settings.find((r) => r.key === 'fleet_pricing')?.value;
  let fleetPricing = { ...DEFAULT_FLEET_PRICING };
  try {
    fleetPricing = parseFleetPricing(typeof pricingRaw === 'string' ? JSON.parse(pricingRaw) : pricingRaw);
  } catch {
    fleetPricing = { ...DEFAULT_FLEET_PRICING };
  }

  const inquiries = (inquiriesRes.data ?? []) as Inquiry[];
  const openCount = inquiries.filter((i) => !['won', 'lost', 'archived'].includes(String(i.status).toLowerCase())).length;

  return (
    <DashboardShell title='Fleet accounts' subtitle='Public fleet sales settings, pricing tiers, and business inquiry follow-up.' role='admin'>
      {inquiriesRes.error ? (
        <p className='rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100'>
          Fleet inquiries could not load: {inquiriesRes.error.message}. Apply migration 000060 if this table is missing.
        </p>
      ) : null}

      <section className='grid gap-4 lg:grid-cols-3'>
        <div className='rounded-3xl border border-gold/20 bg-gradient-to-br from-gold/10 via-black to-zinc-950 p-6 lg:col-span-2'>
          <p className='text-xs font-black uppercase tracking-[0.24em] text-gold-soft'>Fleet public offer</p>
          <h2 className='mt-3 text-2xl font-black uppercase text-white'>Business, dealership, and recurring vehicle care</h2>
          <p className='mt-2 text-sm text-zinc-300'>{fleetBlurb || 'Fleet service copy is ready for the Services page.'}</p>
          <div className='mt-5 flex flex-wrap gap-3'>
            <Link href='/services#fleet' className='inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black'>
              View public section <ExternalLink className='h-3.5 w-3.5' />
            </Link>
            <Link href='/services' className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-300'>Services page</Link>
          </div>
        </div>
        <div className='rounded-3xl border border-white/10 bg-black/45 p-6'>
          <p className='text-xs font-black uppercase tracking-[0.22em] text-zinc-400'>Open inquiries</p>
          <p className='mt-2 text-4xl font-black text-white'>{openCount}</p>
          <p className='mt-2 text-sm text-zinc-500'>{fleetEnabled ? 'Public fleet block is visible.' : 'Public fleet block is hidden.'}</p>
        </div>
      </section>

      <section className='grid gap-5 lg:grid-cols-2'>
        <form action={setFleetServicesSettingAction} className='rounded-3xl border border-gold/20 bg-zinc-950 p-5'>
          <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Public visibility</p>
          <label className='mt-4 flex items-center gap-2 text-sm text-zinc-200'>
            <input name='fleetEnabled' type='checkbox' defaultChecked={fleetEnabled} className='accent-[var(--gold)]' />
            Show fleet section on public Services page
          </label>
          <label className='mt-4 block text-xs text-zinc-400'>
            Public fleet copy
            <textarea name='fleetBlurb' rows={5} defaultValue={fleetBlurb} className='mt-1 w-full rounded-xl border border-white/15 bg-black/45 px-3 py-2 text-sm text-white' />
          </label>
          <button className='mt-4 rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Save public fleet settings</button>
        </form>

        <form action={setFleetPricingAction} className='rounded-3xl border border-gold/20 bg-zinc-950 p-5'>
          <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Fleet pricing tiers</p>
          <div className='mt-4 grid gap-3 sm:grid-cols-2'>
            {(
              [
                ['smallLabel', 'Small tier label'],
                ['smallDetail', 'Small tier detail'],
                ['mediumLabel', 'Medium tier label'],
                ['mediumDetail', 'Medium tier detail'],
                ['largeLabel', 'Large tier label'],
                ['largeDetail', 'Large tier detail'],
                ['weeklyDiscount', 'Weekly discount'],
                ['biweeklyDiscount', 'Bi-weekly discount'],
                ['monthlyDiscount', 'Monthly discount'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className='block text-xs text-zinc-400'>
                {label}
                <input name={key} defaultValue={fleetPricing[key]} className='mt-1 w-full rounded-lg border border-white/15 bg-black/45 px-3 py-2 text-sm text-white' />
              </label>
            ))}
          </div>
          <label className='mt-3 block text-xs text-zinc-400'>
            Commercial notes
            <textarea name='commercialNotes' rows={3} defaultValue={fleetPricing.commercialNotes} className='mt-1 w-full rounded-xl border border-white/15 bg-black/45 px-3 py-2 text-sm text-white' />
          </label>
          <button className='mt-4 rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Save fleet pricing</button>
        </form>
      </section>

      <section className='rounded-3xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Fleet inquiry inbox</p>
        <div className='mt-4 grid gap-3'>
          {inquiries.length === 0 ? (
            <div className='rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500'>
              <Building2 className='mx-auto mb-3 h-8 w-8 text-gold-soft' />
              No fleet inquiries yet.
            </div>
          ) : null}
          {inquiries.map((i) => (
            <article key={i.id} className='rounded-2xl border border-white/10 bg-black/35 p-4'>
              <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
                <div>
                  <p className='text-lg font-black text-white'>{i.company_name}</p>
                  <p className='text-sm text-zinc-300'>{i.contact_name} · {i.email} · {i.phone || 'No phone'}</p>
                  <p className='mt-1 text-xs text-gold-soft'>{i.fleet_size || 'Fleet size pending'} · {when(i.created_at)}</p>
                  {i.message ? <p className='mt-3 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-300'>{i.message}</p> : null}
                </div>
                <form action={updateFleetInquiryStatusAction} className='flex min-w-[220px] gap-2'>
                  <input type='hidden' name='id' value={i.id} />
                  <select name='status' defaultValue={i.status} className='flex-1 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white'>
                    <option value='new'>New</option>
                    <option value='contacted'>Contacted</option>
                    <option value='quoted'>Quoted</option>
                    <option value='won'>Won</option>
                    <option value='lost'>Lost</option>
                    <option value='archived'>Archived</option>
                  </select>
                  <button className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Save</button>
                </form>
              </div>
            </article>
          ))}
        </div>
      </section>
    </DashboardShell>
  );
}
