import Link from 'next/link';
import { Zap } from 'lucide-react';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveBusinessContext } from '@/lib/titan/business-context';
import { EmptyState } from '@/components/ui/empty-state';

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
        <h2 className="text-xl font-black text-foreground">Revenue actions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Next-best moves with preview, edit, schedule send, and Activity Center logging.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Zap className="h-5 w-5" />}
          title="No pending revenue actions"
          description="Titan generates actions from opportunities, unpaid balances, and follow-ups. Run revenue hunt or add opportunities to get started."
          primaryAction={{ label: 'Opportunity board', href: '/titan/opportunities' }}
          secondaryAction={{ label: 'Morning briefing', href: '/admin' }}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const row = r as Record<string, unknown>;
            const entityId = str(row.entity_id);
            return (
              <li key={str(row.id)} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[9px] font-black uppercase text-gold-soft">{str(row.action_type)}</p>
                    <p className="text-sm font-bold text-foreground">{str(row.title)}</p>
                    {row.description ? <p className="mt-1 text-xs text-muted-foreground">{str(row.description)}</p> : null}
                  </div>
                  <span className="text-[10px] font-black uppercase text-muted-foreground">{str(row.status)}</span>
                </div>
                {entityId && str(row.entity_type) === 'opportunity' ? (
                  <Link
                    href={`/titan/opportunities?open=${encodeURIComponent(entityId)}`}
                    className="mt-3 inline-flex text-[10px] font-black uppercase text-gold-soft"
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
