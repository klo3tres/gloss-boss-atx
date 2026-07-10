import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveBusinessContext } from '@/lib/titan/business-context';
import { TitanProjectsPanel } from '@/components/titan/titan-projects-panel';

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
        <h2 className="text-xl font-black text-foreground">Projects</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Track detailing jobs, retainers, website builds, and milestones. Won opportunities can be converted here.
        </p>
      </div>

      <TitanProjectsPanel />

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
          No projects yet. Create one above or mark an opportunity as booked, then add a project for delivery tracking.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const row = r as Record<string, unknown>;
            return (
              <li key={str(row.id)} className="rounded-xl border border-border bg-card px-4 py-3 text-xs shadow-sm">
                <p className="font-bold text-foreground">{str(row.title)}</p>
                <p className="text-muted-foreground">
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
