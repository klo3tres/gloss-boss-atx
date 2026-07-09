import Link from 'next/link';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveBusinessContext } from '@/lib/titan/business-context';

export const dynamic = 'force-dynamic';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export default async function TitanActionsPage() {
  const admin = tryCreateAdminSupabase();
  const ctx = admin ? await resolveBusinessContext(admin) : null;
  if (!ctx || !admin) return null;

  const { data: actions } = await admin
    .from('titan_actions')
    .select('*')
    .eq('business_id', ctx.businessId)
    .in('status', ['pending', 'scheduled', 'in_progress'])
    .order('priority', { ascending: false })
    .limit(50);

  const rows = actions ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black text-white">Revenue actions</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Next-best moves with preview, edit, schedule send, and Activity Center logging.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-zinc-950 p-6 text-sm text-zinc-500">
          No pending actions. External leads and opportunities will generate actions automatically.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const row = r as Record<string, unknown>;
            const entityId = str(row.entity_id);
            return (
              <li key={str(row.id)} className="rounded-xl border border-white/10 bg-zinc-950 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[9px] font-black uppercase text-amber-400">{str(row.action_type)}</p>
                    <p className="text-sm font-bold text-white">{str(row.title)}</p>
                    {row.description ? <p className="mt-1 text-xs text-zinc-500">{str(row.description)}</p> : null}
                  </div>
                  <span className="text-[10px] font-black uppercase text-zinc-500">{str(row.status)}</span>
                </div>
                {entityId && str(row.entity_type) === 'opportunity' ? (
                  <Link
                    href={`/titan/opportunities?open=${encodeURIComponent(entityId)}`}
                    className="mt-3 inline-flex text-[10px] font-black uppercase text-amber-200"
                  >
                    Preview & send →
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
