import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { isFreePromoEnabled } from '@/lib/free-promo';
import { archivePromoCodeAction, savePromoCodeAction } from './promo-code-actions';
import { GlassCard, PremiumBadge, SectionEyebrow, CollapsibleSection } from '@/components/ui/premium';
import { Sparkles, Calendar, Tag, Percent, Trash2, Archive, Check, Plus, AlertCircle, ArrowLeft, ExternalLink } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
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
    <GlassCard className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-zinc-950/80 to-black relative overflow-hidden" glow>
      <div className="absolute top-0 right-0 h-24 w-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
      <div className="flex justify-between items-start mb-4">
        <div>
          <SectionEyebrow className="text-emerald-300">FREE promo (Single Control)</SectionEyebrow>
          <h2 className="mt-1 text-2xl font-black uppercase text-white tracking-tight">
            {freeEnabled ? 'FREE is ON for /book' : 'FREE is OFF'}
          </h2>
        </div>
        <PremiumBadge tone={freeEnabled ? 'emerald' : 'zinc'}>
          {freeEnabled ? 'Active' : 'Disabled'}
        </PremiumBadge>
      </div>
      
      <p className="text-xs text-zinc-300 leading-relaxed max-w-3xl">
        Customers enter code <strong className="text-white">FREE</strong> on the booking page. When enabled below, the cart total becomes $0.00, Stripe is skipped, and the job is saved as comped. There is no separate master gate — only this FREE row matters.
      </p>

      <form action={savePromoCodeAction} className="mt-6 grid gap-4 md:grid-cols-2">
        {id ? <input type="hidden" name="id" value={id} /> : null}
        <input type="hidden" name="code" value="FREE" />
        <input type="hidden" name="discountType" value="comp" />
        <input type="hidden" name="discountValue" value="100" />
        <input type="hidden" name="rulesJson" value='{"appliesTo":"order"}' />
        
        <div className="md:col-span-2 flex items-center gap-2.5 rounded-xl border border-white/5 bg-black/40 px-4 py-3.5">
          <input 
            name="enabled" 
            type="checkbox" 
            id="free-enabled-check"
            defaultChecked={freeEnabled} 
            className="h-4 w-4 accent-emerald-500 cursor-pointer"
          />
          <label htmlFor="free-enabled-check" className="text-xs font-bold text-zinc-200 cursor-pointer">
            Enable FREE promo code at checkout
          </label>
        </div>

        <label className="block text-xs text-zinc-400 md:col-span-2">
          Description / Label
          <input
            name="description"
            defaultValue={str(freeRow?.description) || 'Owner test comp — full order $0'}
            placeholder="e.g., Owner test comp — full order $0"
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 outline-none transition"
          />
        </label>

        <label className="block text-xs text-zinc-400 md:col-span-2">
          Service Restrictions (Optional, comma-separated slugs)
          <input
            name="serviceRestrictions"
            defaultValue={serviceRestrictionsText(freeRow?.service_restrictions)}
            placeholder="e.g., full-detail, exterior-wash (leave blank for any service)"
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 outline-none transition"
          />
        </label>

        <label className="block text-xs text-zinc-400">
          Starts At
          <input 
            name="startsAt" 
            type="datetime-local" 
            defaultValue={str(freeRow?.starts_at).slice(0, 16)} 
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-xs text-white focus:border-emerald-500 outline-none transition" 
          />
        </label>

        <label className="block text-xs text-zinc-400">
          Ends At
          <input 
            name="endsAt" 
            type="datetime-local" 
            defaultValue={str(freeRow?.ends_at).slice(0, 16)} 
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-xs text-white focus:border-emerald-500 outline-none transition" 
          />
        </label>

        <label className="block text-xs text-zinc-400">
          Max Uses Limit
          <input 
            name="maxUses" 
            type="number" 
            min="0" 
            defaultValue={str(freeRow?.max_uses)} 
            placeholder="e.g., 50 (blank = unlimited)" 
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-xs text-white focus:border-emerald-500 outline-none transition" 
          />
        </label>

        <div className="flex flex-col gap-2 justify-center">
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input 
              name="stackable" 
              type="checkbox" 
              defaultChecked={str(freeRow?.rules).includes('"stackable":true')} 
              className="accent-emerald-500"
            />
            Stackable with other promotions
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input 
              name="testModeOnly" 
              type="checkbox" 
              defaultChecked={str(freeRow?.rules).includes('testModeOnly')} 
              className="accent-emerald-500"
            />
            Test mode only (comp log, still $0)
          </label>
        </div>

        <button 
          type="submit" 
          className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3.5 text-xs font-black uppercase tracking-widest text-black shadow-md hover:brightness-110 transition duration-200 md:col-span-2"
        >
          Save FREE promo config
        </button>
      </form>
    </GlassCard>
  );
}

export default async function AdminPromotionsPage() {
  const admin = tryCreateAdminSupabase();
  const { rows, error } = await loadPromoRows(admin);
  const freeEnabled = admin ? await isFreePromoEnabled(admin) : false;
  const freeRow = rows.find((r) => str(r.code).toUpperCase() === 'FREE') ?? null;
  const otherRows = rows.filter((r) => str(r.code).toUpperCase() !== 'FREE');

  return (
    <DashboardShell title="Promotions & Codes" subtitle="Configure automatic deals, customer discount promo codes, and special comp systems." role="admin">
      <div className="flex flex-wrap gap-2 text-xs print:hidden mb-6">
        <Link href="/admin/pricing" className="flex items-center gap-1 rounded-xl border border-white/10 bg-zinc-950 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:border-gold/40">
          Deals Page
        </Link>
        <Link href="/book" target="_blank" className="flex items-center gap-1 rounded-xl border border-gold/25 bg-gold/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-gold-soft hover:bg-gold/20">
          Test on /book <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-200 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          Promotions Error: {error.message}
        </p>
      ) : null}

      <div className="space-y-6">
        {/* FREE COMP SECTION */}
        <FreePromoSection freeRow={freeRow} freeEnabled={freeEnabled} />

        {/* CREATE NEW PROMO CODE */}
        <CollapsibleSection title="Create New Promotion Code" subtitle="Issue discount or comp codes for marketing or apologies." defaultOpen={false}>
          <form action={savePromoCodeAction} className="grid gap-4 md:grid-cols-2">
            <label className="block text-xs text-zinc-400">
              Promo Code (Uppercase letters/numbers)
              <input 
                name="code" 
                placeholder="e.g. SUMMER20" 
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2.5 uppercase text-white font-bold placeholder-zinc-500 focus:border-gold/50 outline-none transition" 
                required 
              />
            </label>

            <label className="block text-xs text-zinc-400">
              Description / Internal Note
              <input 
                name="description" 
                placeholder="e.g. 20% off summer mobile wash details" 
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2.5 text-white placeholder-zinc-500 focus:border-gold/50 outline-none transition" 
              />
            </label>

            <label className="block text-xs text-zinc-400">
              Discount Class
              <select name="discountType" className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2.5 text-white focus:border-gold/50 outline-none transition">
                <option value="percent">Percent (%) Discount</option>
                <option value="amount">Fixed Dollar ($) Discount</option>
                <option value="comp">Comp / Free (100% discount)</option>
              </select>
            </label>

            <label className="block text-xs text-zinc-400">
              Value (Percent rate or dollar cents)
              <input 
                name="discountValue" 
                type="number" 
                min="0" 
                step="0.01" 
                placeholder="e.g. 20 or 15.00" 
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2.5 text-white placeholder-zinc-500 focus:border-gold/50 outline-none transition" 
              />
            </label>

            <label className="block text-xs text-zinc-400 md:col-span-2">
              Service Restrictions (Optional, comma-separated slugs)
              <input 
                name="serviceRestrictions" 
                placeholder="e.g. ceramic-coating, full-detail" 
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2.5 text-white placeholder-zinc-500 focus:border-gold/50 outline-none transition md:col-span-2" 
              />
            </label>

            <label className="block text-xs text-zinc-400">
              Starts At
              <input 
                name="startsAt" 
                type="datetime-local" 
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white focus:border-gold/50 outline-none transition" 
              />
            </label>

            <label className="block text-xs text-zinc-400">
              Ends At
              <input 
                name="endsAt" 
                type="datetime-local" 
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white focus:border-gold/50 outline-none transition" 
              />
            </label>

            <label className="block text-xs text-zinc-400">
              Max Uses Limit
              <input 
                name="maxUses" 
                type="number" 
                min="0" 
                placeholder="e.g. 100 uses" 
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white placeholder-zinc-500 focus:border-gold/50 outline-none transition" 
              />
            </label>

            <label className="block text-xs text-zinc-400">
              Rules JSON Configuration
              <textarea
                name="rulesJson"
                rows={2}
                placeholder='{"appliesTo":"order"}'
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 font-mono text-xs text-white placeholder-zinc-500 focus:border-gold/50 outline-none transition"
              />
            </label>

            <div className="md:col-span-2 flex items-center gap-2.5 rounded-xl border border-white/5 bg-black/45 px-4 py-3">
              <input 
                name="enabled" 
                type="checkbox" 
                id="new-enabled-check"
                className="h-4 w-4 accent-gold cursor-pointer"
              />
              <label htmlFor="new-enabled-check" className="text-xs font-bold text-zinc-200 cursor-pointer">
                Code is active immediately
              </label>
            </div>

            <button type="submit" className="mt-2 rounded-xl bg-gradient-to-r from-gold via-gold-soft to-gold px-6 py-3.5 text-xs font-black uppercase tracking-widest text-black shadow-md hover:brightness-110 transition duration-200 md:col-span-2">
              Save Promo Code
            </button>
          </form>
        </CollapsibleSection>

        {/* ACTIVE CODES GRID */}
        <section>
          <SectionEyebrow className="mb-4">Active & Synced Promo Codes</SectionEyebrow>
          {otherRows.length === 0 ? (
            <GlassCard className="text-center py-10 border border-dashed border-white/10 bg-black/20">
              <p className="text-xs text-zinc-500 italic">No other promo codes generated yet.</p>
            </GlassCard>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {otherRows.map((r) => (
                <GlassCard key={str(r.id)} className="space-y-4 hover:border-gold/30 transition duration-300 relative">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-black text-white font-mono uppercase tracking-tight">{str(r.code)}</h3>
                      <p className="text-xs text-zinc-400 mt-1">{str(r.description) || '(No description)'}</p>
                    </div>
                    <PremiumBadge tone={r.enabled === true ? 'gold' : 'zinc'}>
                      {r.enabled === true ? 'Active' : 'Paused'}
                    </PremiumBadge>
                  </div>

                  <form action={savePromoCodeAction} className="space-y-3.5 border-t border-white/5 pt-3 text-xs">
                    <input type="hidden" name="id" value={str(r.id)} />
                    
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-[10px] text-zinc-500 font-bold uppercase">
                        Code
                        <input name="code" defaultValue={str(r.code)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white" />
                      </label>
                      <label className="text-[10px] text-zinc-500 font-bold uppercase">
                        Description
                        <input name="description" defaultValue={str(r.description)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white" />
                      </label>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-[10px] text-zinc-500 font-bold uppercase">
                        Type
                        <select name="discountType" defaultValue={str(r.discount_type) || 'percent'} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white">
                          <option value="percent">Percent</option>
                          <option value="amount">Dollar amount</option>
                          <option value="comp">Comp / free</option>
                        </select>
                      </label>
                      <label className="text-[10px] text-zinc-500 font-bold uppercase">
                        Value
                        <input name="discountValue" type="number" min="0" step="0.01" defaultValue={str(r.discount_value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white" />
                      </label>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-[10px] text-zinc-500 font-bold uppercase">
                        Services (comma separated)
                        <input name="serviceRestrictions" defaultValue={serviceRestrictionsText(r.service_restrictions)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white" />
                      </label>
                      <label className="text-[10px] text-zinc-500 font-bold uppercase">
                        Max Uses
                        <input name="maxUses" type="number" min="0" defaultValue={str(r.max_uses)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white" />
                      </label>
                    </div>

                    <label className="block text-[10px] text-zinc-500 font-bold uppercase">
                      Rules JSON
                      <textarea name="rulesJson" rows={1} defaultValue={rulesJson(r)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs font-mono text-zinc-300" />
                    </label>

                    <div className="flex items-center justify-between border-t border-white/5 pt-3 mt-1">
                      <label className="flex items-center gap-1.5 text-zinc-300 cursor-pointer font-bold">
                        <input name="enabled" type="checkbox" defaultChecked={r.enabled === true} className="accent-gold h-4 w-4" /> Enabled
                      </label>

                      <div className="flex items-center gap-2">
                        <button type="submit" className="rounded-lg bg-gold/15 hover:bg-gold/25 border border-gold/30 px-3.5 py-1.5 text-[10px] font-black uppercase text-gold-soft transition">
                          Save Changes
                        </button>
                      </div>
                    </div>
                  </form>

                  <div className="border-t border-white/5 pt-2 flex justify-end">
                    <form action={archivePromoCodeAction}>
                      <input type="hidden" name="id" value={str(r.id)} />
                      <ConfirmSubmitButton message={`Archive promo code ${r.code}?`} className="text-[10px] font-black uppercase text-rose-300 hover:text-rose-200 transition flex items-center gap-1">
                        <Archive className="h-3.5 w-3.5" /> Archive Promo
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </section>
      </div>

      <Link href="/admin" className="mt-8 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gold-soft hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
      </Link>
    </DashboardShell>
  );
}
