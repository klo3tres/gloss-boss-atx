import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveBusinessContext } from '@/lib/titan/business-context';

export const dynamic = 'force-dynamic';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export default async function TitanProjectsPage() {
  const admin = tryCreateAdminSupabase();
  const ctx = admin ? await resolveBusinessContext(admin) : null;
  if (!ctx || !admin) return null;

  const { data: projects } = await admin
    .from('titan_projects')
    .select('*')
    .eq('business_id', ctx.businessId)
    .order('created_at', { ascending: false })
    .limit(50);

  const rows = projects ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black text-white">Projects</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Calendar and project tracking for website builds, detailing jobs, retainers, and milestones.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-zinc-950 p-6 text-sm text-zinc-500">
          No projects yet. Convert won opportunities into projects (automation coming in next pass).
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const row = r as Record<string, unknown>;
            return (
              <li key={str(row.id)} className="rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-xs">
                <p className="font-bold text-white">{str(row.title)}</p>
                <p className="text-zinc-500">
                  {str(row.project_type)} · {str(row.status)}
                  {row.due_at ? ` · due ${new Date(str(row.due_at)).toLocaleDateString()}` : ''}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
