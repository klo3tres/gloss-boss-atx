import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { isFreePromoEnabled } from '@/lib/free-promo';
import { archivePromoCodeAction, savePromoCodeAction } from './promo-code-actions';

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

function rulesJson(r: Row) {
  if (r.rules && typeof r.rules === 'object') return JSON.stringify(r.rules, null, 0);
  return '{"appliesTo":"order"}';
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
  if (!lean.error) return { rows: (lean.data ?? []) as Row[], error: lean.error };
  return { rows: [] as Row[], error: lean.error ?? noArchiveFilter.error ?? full.error };
}

function FreePromoSection({ freeRow, freeEnabled }: { freeRow: Row | null; freeEnabled: boolean }) {
  const id = str(freeRow?.id);
  return (
    <section className='rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-black to-zinc-950 p-5'>
      <p className='text-xs font-black uppercase tracking-[0.22em] text-emerald-300'>FREE promo (single control)</p>
      <h2 className='mt-1 text-xl font-black uppercase text-white'>{freeEnabled ? 'FREE is ON for /book' : 'FREE is OFF'}</h2>
      <p className='mt-2 text-sm text-zinc-400'>
        Customers enter code <strong className='text-white'>FREE</strong> on the booking page. When enabled below, the cart total becomes $0.00, Stripe is skipped, and the job is saved as comped.
        There is no separate master gate — only this FREE row matters.
      </p>
      <form action={savePromoCodeAction} className='mt-5 grid gap-3 md:grid-cols-2'>
        {id ? <input type='hidden' name='id' value={id} /> : null}
        <input type='hidden' name='code' value='FREE' />
        <input type='hidden' name='discountType' value='comp' />
        <input type='hidden' name='discountValue' value='100' />
        <input type='hidden' name='rulesJson' value='{"appliesTo":"order"}' />
        <label className='flex items-center gap-2 text-sm font-bold text-zinc-100 md:col-span-2'>
          <input name='enabled' type='checkbox' defaultChecked={freeEnabled} />
          Enable FREE promo
        </label>
        <input
          name='description'
          defaultValue={str(freeRow?.description) || 'Owner test comp — full order $0'}
          placeholder='Description'
          className='rounded border border-zinc-700 bg-black px-3 py-2 text-white md:col-span-2'
        />
        <input
          name='serviceRestrictions'
          defaultValue={serviceRestrictionsText(freeRow?.service_restrictions)}
          placeholder='Service slugs (optional, comma separated) — leave blank for any service'
          className='rounded border border-zinc-700 bg-black px-3 py-2 text-white md:col-span-2'
        />
        <input name='startsAt' type='datetime-local' defaultValue={str(freeRow?.starts_at).slice(0, 16)} className='rounded border border-zinc-700 bg-black px-3 py-2 text-white' />
        <input name='endsAt' type='datetime-local' defaultValue={str(freeRow?.ends_at).slice(0, 16)} className='rounded border border-zinc-700 bg-black px-3 py-2 text-white' />
        <input name='maxUses' type='number' min='0' defaultValue={str(freeRow?.max_uses)} placeholder='Max uses (blank = unlimited)' className='rounded border border-zinc-700 bg-black px-3 py-2 text-white' />
        <label className='flex items-center gap-2 text-sm text-zinc-300'>
          <input name='stackable' type='checkbox' defaultChecked={str(freeRow?.rules).includes('"stackable":true')} />
          Stackable with other promos
        </label>
        <label className='flex items-center gap-2 text-sm text-zinc-300'>
          <input name='testModeOnly' type='checkbox' defaultChecked={str(freeRow?.rules).includes('testModeOnly')} />
          Test mode only (logs comp, still $0)
        </label>
        <button type='submit' className='rounded bg-gold px-4 py-3 text-xs font-black uppercase text-black md:col-span-2'>
          Save FREE promo
        </button>
      </form>
    </section>
  );
}

export default async function AdminPromotionsPage() {
  const admin = tryCreateAdminSupabase();
  const { rows, error } = await loadPromoRows(admin);
  const freeEnabled = admin ? await isFreePromoEnabled(admin) : false;
  const freeRow = rows.find((r) => str(r.code).toUpperCase() === 'FREE') ?? null;
  const otherRows = rows.filter((r) => str(r.code).toUpperCase() !== 'FREE');

  return (
    <DashboardShell title='Promo codes' subtitle='One FREE control. All other codes below.' role='admin'>
      <div className='flex flex-wrap gap-2 text-xs'>
        <Link href='/admin/pricing' className='rounded border border-white/15 px-3 py-2 font-bold uppercase text-zinc-300'>
          Deals page
        </Link>
        <Link href='/book' className='rounded border border-gold/40 px-3 py-2 font-bold uppercase text-gold-soft'>
          Test on /book
        </Link>
      </div>
      {error ? <p className='rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100'>{error.message}</p> : null}
      <FreePromoSection freeRow={freeRow} freeEnabled={freeEnabled} />
      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>New promo code</p>
        <form action={savePromoCodeAction} className='mt-4 grid gap-3 md:grid-cols-2'>
          <input name='code' placeholder='SUMMER20' className='rounded border border-zinc-700 bg-black px-3 py-2 uppercase text-white' required />
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
          <textarea
            name='rulesJson'
            rows={2}
            placeholder='{"appliesTo":"order"}'
            className='rounded border border-zinc-700 bg-black px-3 py-2 font-mono text-xs text-white md:col-span-2'
          />
          <label className='flex items-center gap-2 text-sm text-zinc-300'>
            <input name='enabled' type='checkbox' /> Enabled
          </label>
          <button className='rounded bg-gold px-4 py-2 text-xs font-black uppercase text-black md:col-span-2'>Save promo code</button>
        </form>
      </section>
      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Other codes</p>
        <div className='mt-4 space-y-3'>
          {otherRows.length === 0 ? <p className='text-sm text-zinc-500'>No other promo codes.</p> : null}
          {otherRows.map((r) => (
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
                <textarea name='rulesJson' rows={2} defaultValue={rulesJson(r)} className='rounded border border-zinc-700 bg-black px-3 py-2 font-mono text-xs text-white md:col-span-2' />
                <label className='flex items-center gap-2 text-sm text-zinc-300'>
                  <input name='enabled' type='checkbox' defaultChecked={r.enabled === true} /> Enabled
                </label>
                <button className='rounded border border-gold/40 px-4 py-2 text-xs font-black uppercase text-gold-soft'>Save</button>
              </form>
              <form action={archivePromoCodeAction} className='mt-2'>
                <input type='hidden' name='id' value={str(r.id)} />
                <ConfirmSubmitButton message='Archive this promo code?' className='text-xs font-bold uppercase text-amber-200 underline'>
                  Archive
                </ConfirmSubmitButton>
              </form>
            </article>
          ))}
        </div>
      </section>
    </DashboardShell>
  );
}
