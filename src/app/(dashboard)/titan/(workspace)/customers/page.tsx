import Link from 'next/link';
import { Users } from 'lucide-react';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveBusinessContext } from '@/lib/titan/business-context';
import { EmptyState } from '@/components/ui/empty-state';

export const dynamic = 'force-dynamic';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export default async function TitanCustomersPage() {
  const admin = tryCreateAdminSupabase();
  const ctx = admin ? await resolveBusinessContext(admin) : null;
  if (!ctx || !admin) return null;

  const { data: contacts } = await admin
    .from('business_contacts')
    .select('*')
    .eq('business_id', ctx.businessId)
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = contacts ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black text-foreground">Customers & contacts</h2>
        <p className="mt-1 text-sm text-muted-foreground">Tenant-scoped contacts from API leads, opportunities, and intake.</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No contacts yet"
          description="Leads from Titan radar, opportunities, and intake forms will appear here. You can also manage full CRM customers in Gloss Boss admin."
          primaryAction={{ label: 'Open customers', href: '/admin/customers' }}
          secondaryAction={{ label: 'Lead radar', href: '/admin/titan/lead-radar' }}
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const row = r as Record<string, unknown>;
            return (
              <li key={str(row.id)} className="rounded-xl border border-border bg-card px-4 py-3 text-xs">
                <p className="font-bold text-foreground">{str(row.full_name) || 'Contact'}</p>
                <p className="text-muted-foreground">
                  {str(row.email) || '—'} · {str(row.phone) || '—'}
                  {str(row.company) ? ` · ${str(row.company)}` : ''}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
