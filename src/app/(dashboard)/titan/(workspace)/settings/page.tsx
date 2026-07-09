import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveBusinessContext } from '@/lib/titan/business-context';
import { loadTitanWorkspace } from '@/lib/titan/workspace';
import { INDUSTRY_LABELS } from '@/lib/titan/workspace';
import { opportunityTypesForIndustry } from '@/lib/titan/industry-profiles';

export const dynamic = 'force-dynamic';

export default async function TitanSettingsPage() {
  const admin = tryCreateAdminSupabase();
  const ctx = admin ? await resolveBusinessContext(admin) : null;
  if (!ctx || !admin) return null;

  const workspace = await loadTitanWorkspace(admin);
  const oppTypes = opportunityTypesForIndustry(ctx.business.industry);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black text-white">Workspace settings</h2>
        <p className="mt-1 text-sm text-zinc-400">Business profile, industry modules, and tenant metadata.</p>
      </div>

      <dl className="grid gap-3 rounded-2xl border border-white/10 bg-zinc-950 p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[10px] uppercase text-zinc-500">Business ID</dt>
          <dd className="font-mono text-xs text-zinc-300">{ctx.businessId}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase text-zinc-500">Workspace key</dt>
          <dd className="font-mono text-xs text-zinc-300">{ctx.workspaceKey}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase text-zinc-500">Industry</dt>
          <dd className="text-zinc-200">{INDUSTRY_LABELS[workspace.industry as keyof typeof INDUSTRY_LABELS] ?? ctx.business.industry.replace(/_/g, ' ')}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase text-zinc-500">Slug</dt>
          <dd className="text-zinc-200">{ctx.business.slug}</dd>
        </div>
      </dl>

      <section className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
        <h3 className="text-sm font-black text-white">Opportunity types for your industry</h3>
        <ul className="mt-3 flex flex-wrap gap-2">
          {oppTypes.map((t) => (
            <li key={t.key} className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-bold uppercase text-zinc-400">
              {t.label}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
