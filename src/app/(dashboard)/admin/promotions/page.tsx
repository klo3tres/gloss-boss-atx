import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { archivePromoCodeAction, savePromoCodeAction, setFreeTestPromoSettingAction } from './promo-code-actions';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

function str(v: unknown) {
  return v == null ? '' : String(v);
}

function serviceRestrictionsText(v: unknown) {
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v) as unknown;
      if (Array.isArray(parsed)) return parsed.join(', ');
    } catch {
      return v;
    }
  }
  return '';
}

async function loadPromoRows(admin: ReturnType<typeof tryCreateAdminSupabase>) {
  if (!admin) return { rows: [] as Row[], error: null as { message: string } | null };
  const full = await admin.from('promo_codes').select('*').is('archived_at', null).order('created_at', { ascending: false }).limit(100);
  if (!full.error) return { rows: (full.data ?? []) as Row[], error: null };

  const noArchiveFilter = await admin.from('promo_codes').select('*').order('created_at', { ascending: false }).limit(100);
  if (!noArchiveFilter.error) {
    return {
      rows: ((noArchiveFilter.data ?? []) as Row[]).filter((r) => !r.archived_at && r.archived !== true),
      error: null,
    };
  }

  const lean = await admin.from('promo_codes').select('id, code, description').limit(100);
  if (!lean.error) return { rows: (lean.data ?? []) as Row[], error: full.error };
  return { rows: [] as Row[], error: lean.error ?? noArchiveFilter.error ?? full.error };
}

async function loadFreeSetting(admin: ReturnType<typeof tryCreateAdminSupabase>) {
  if (!admin) return false;
  const full = await admin.from('site_settings').select('key, value, allow_free_test_promo').limit(20);
  if (!full.error) {
    return ((full.data ?? []) as Row[]).some(
      (r) => r.allow_free_test_promo === true || (str(r.key) === 'allow_free_test_promo' && str(r.value).toLowerCase() === 'true'),
    );
  }
  const lean = await admin.from('site_settings').select('key, value').eq('key', 'allow_free_test_promo').limit(1);
  return ((lean.data ?? []) as Row[]).some((r) => str(r.value).toLowerCase() === 'true');
}

export default async function AdminPromotionsPage() {
  const admin = tryCreateAdminSupabase();
  const { rows, error } = await loadPromoRows(admin);
  const allowFree = await loadFreeSetting(admin);

  return (
    <DashboardShell title='Promo codes' subtitle='Create, disable, restrict, and archive booking promo codes.' role='admin'>
      <div className='flex flex-wrap gap-2 text-xs'>
        <Link href='/admin/pricing' className='rounded border border-white/15 px-3 py-2 font-bold uppercase text-zinc-300'>Deals page</Link>
        <Link href='/admin/services' className='rounded border border-white/15 px-3 py-2 font-bold uppercase text-zinc-300'>Services</Link>
      </div>
      {error ? <p className='rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100'>{error.message}. Run migration 000042.</p> : null}
      <section className='rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-black to-zinc-950 p-5 shadow-[0_0_30px_rgba(16,185,129,0.12)]'>
        <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
          <div>
            <p className='text-xs font-black uppercase tracking-[0.22em] text-emerald-300'>FREE test promo gate</p>
            <h2 className='mt-1 text-xl font-black uppercase text-white'>{allowFree ? 'FREE is enabled' : 'FREE is disabled'}</h2>
            <p className='mt-1 text-sm text-zinc-400'>When enabled, FREE applies only to Sedan Exterior Wash, sets the booking total to $0, bypasses Stripe, and marks the job as a comped test.</p>
          </div>
          <form action={setFreeTestPromoSettingAction} className='flex items-center gap-3 rounded-xl border border-white/10 bg-black/35 p-3'>
            <label className='flex items-center gap-2 text-sm font-bold text-zinc-200'>
              <input name='allowFreeTestPromo' type='checkbox' defaultChecked={allowFree} />
              Enable FREE test promo
            </label>
            <button className='rounded bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Save</button>
          </form>
        </div>
      </section>
      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>New promo code</p>
        <form action={savePromoCodeAction} className='mt-4 grid gap-3 md:grid-cols-2'>
          <input name='code' placeholder='FREE' className='rounded border border-zinc-700 bg-black px-3 py-2 uppercase text-white' required />
          <input name='description' placeholder='Description' className='rounded border border-zinc-700 bg-black px-3 py-2 text-white' />
          <select name='discountType' className='rounded border border-zinc-700 bg-black px-3 py-2 text-white'>
            <option value='percent'>Percent</option>
            <option value='amount'>Dollar amount</option>
            <option value='comp'>Comp / free</option>
          </select>
          <input name='discountValue' type='number' min='0' step='0.01' placeholder='Discount value' className='rounded border border-zinc-700 bg-black px-3 py-2 text-white' />
          <input name='serviceRestrictions' placeholder='service slugs, comma separated' className='rounded border border-zinc-700 bg-black px-3 py-2 text-white md:col-span-2' />
          <input name='startsAt' type='datetime-local' className='rounded border border-zinc-700 bg-black px-3 py-2 text-white' />
          <input name='endsAt' type='datetime-local' className='rounded border border-zinc-700 bg-black px-3 py-2 text-white' />
          <input name='maxUses' type='number' min='0' placeholder='Max uses' className='rounded border border-zinc-700 bg-black px-3 py-2 text-white' />
          <label className='flex items-center gap-2 text-sm text-zinc-300'><input name='enabled' type='checkbox' /> Enabled</label>
          <button className='rounded bg-gold px-4 py-2 text-xs font-black uppercase text-black md:col-span-2'>Save promo code</button>
        </form>
      </section>
      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Active / disabled codes</p>
        <div className='mt-4 space-y-3'>
          {rows.length === 0 ? <p className='text-sm text-zinc-500'>No promo codes yet.</p> : null}
          {rows.map((r) => (
            <article key={str(r.id)} className='rounded-xl border border-white/10 bg-black/30 p-4 text-sm'>
              <form action={savePromoCodeAction} className='grid gap-2 md:grid-cols-2'>
                <input type='hidden' name='id' value={str(r.id)} />
                <input name='code' defaultValue={str(r.code)} className='rounded border border-zinc-700 bg-black px-3 py-2 uppercase text-white' />
                <input name='description' defaultValue={str(r.description)} className='rounded border border-zinc-700 bg-black px-3 py-2 text-white' />
                <select name='discountType' defaultValue={str(r.discount_type) || 'percent'} className='rounded border border-zinc-700 bg-black px-3 py-2 text-white'>
                  <option value='percent'>Percent</option>
                  <option value='amount'>Dollar amount</option>
                  <option value='comp'>Comp / free</option>
                </select>
                <input name='discountValue' type='number' min='0' step='0.01' defaultValue={str(r.discount_value)} className='rounded border border-zinc-700 bg-black px-3 py-2 text-white' />
                <input name='serviceRestrictions' defaultValue={serviceRestrictionsText(r.service_restrictions)} className='rounded border border-zinc-700 bg-black px-3 py-2 text-white md:col-span-2' />
                <input name='maxUses' type='number' min='0' defaultValue={str(r.max_uses)} className='rounded border border-zinc-700 bg-black px-3 py-2 text-white' />
                <label className='flex items-center gap-2 text-sm text-zinc-300'><input name='enabled' type='checkbox' defaultChecked={r.enabled === true} /> Enabled</label>
                <button className='rounded border border-gold/40 px-4 py-2 text-xs font-black uppercase text-gold-soft'>Save</button>
              </form>
              <form action={archivePromoCodeAction} className='mt-2'>
                <input type='hidden' name='id' value={str(r.id)} />
                <ConfirmSubmitButton message='Archive this promo code?' className='text-xs font-bold uppercase text-amber-200 underline'>Archive</ConfirmSubmitButton>
              </form>
            </article>
          ))}
        </div>
      </section>
      <p className='text-xs text-zinc-500'>FREE remains protected by `site_settings.allow_free_test_promo` and booking validation.</p>
    </DashboardShell>
  );
}
