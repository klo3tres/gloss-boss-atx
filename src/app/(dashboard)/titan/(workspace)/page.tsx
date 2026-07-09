import Link from 'next/link';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveBusinessContext } from '@/lib/titan/business-context';
import { loadBusinessIntegrations } from '@/lib/titan/integrations';
import { loadRevenueOpportunities } from '@/lib/titan/revenue-opportunities';
import { opportunityTypesForIndustry } from '@/lib/titan/industry-profiles';

export const dynamic = 'force-dynamic';

export default async function TitanHomePage() {
  const admin = tryCreateAdminSupabase();
  const ctx = admin ? await resolveBusinessContext(admin) : null;
  if (!ctx || !admin) return null;

  const [integrations, opps] = await Promise.all([
    loadBusinessIntegrations(admin, ctx.businessId),
    loadRevenueOpportunities(admin, ctx.workspaceKey, ctx.businessId),
  ]);

  const openOpps = opps.opportunities.filter((o) => !['won', 'lost', 'ignored', 'booked'].includes(o.status));
  const connectedCount = integrations.integrations.filter((i) => i.status === 'connected').length;
  const oppTypes = opportunityTypesForIndustry(ctx.business.industry);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-zinc-950 to-zinc-950 p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">Titan operating system</p>
        <h2 className="mt-2 text-2xl font-black text-white">CRM · leads · follow-ups · integrations · revenue actions</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Not just a CRM — Titan combines opportunity tracking, automated follow-up sequences, calendar and project
          tracking, AI recommendations, and outbound messaging in one workspace.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <p className="text-[9px] uppercase text-zinc-500">Open opportunities</p>
            <p className="text-2xl font-black text-white">{openOpps.length}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <p className="text-[9px] uppercase text-zinc-500">Integrations live</p>
            <p className="text-2xl font-black text-white">{connectedCount}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <p className="text-[9px] uppercase text-zinc-500">Industry types</p>
            <p className="text-2xl font-black text-white">{oppTypes.length}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
          <h3 className="text-sm font-black text-white">Quick start</h3>
          <ul className="mt-3 space-y-2 text-xs text-zinc-400">
            <li>
              <Link href="/titan/start" className="text-amber-200 hover:underline">
                Complete onboarding
              </Link>
            </li>
            <li>
              <Link href="/titan/connect" className="text-amber-200 hover:underline">
                Connect Google, Stripe, Twilio
              </Link>
            </li>
            <li>
              <Link href="/titan/api-keys" className="text-amber-200 hover:underline">
                Create website lead API key
              </Link>
            </li>
            <li>
              <Link href="/titan/actions" className="text-amber-200 hover:underline">
                Review revenue actions
              </Link>
            </li>
          </ul>
        </div>
        <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
          <h3 className="text-sm font-black text-white">Gloss Boss tenant</h3>
          <p className="mt-2 text-xs text-zinc-400">
            {ctx.business.isPlatformTenant
              ? 'This workspace is the Gloss Boss production tenant. Your existing /admin CRM, dispatch, and payments continue to work unchanged.'
              : 'This is a standalone Titan workspace. Connect your stack and start capturing leads.'}
          </p>
          {ctx.business.isPlatformTenant ? (
            <Link href="/admin" className="mt-4 inline-flex rounded-lg bg-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-200">
              Open Gloss Boss admin
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}
