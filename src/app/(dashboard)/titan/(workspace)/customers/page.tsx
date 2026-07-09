import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveBusinessContext } from '@/lib/titan/business-context';

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
        <h2 className="text-xl font-black text-white">Customers & contacts</h2>
        <p className="mt-1 text-sm text-zinc-400">Tenant-scoped contacts from API leads, opportunities, and intake.</p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-zinc-950 p-6 text-sm text-zinc-500">
          No contacts yet — POST a lead to <code className="text-amber-200">/api/titan/leads</code> or add opportunities manually.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const row = r as Record<string, unknown>;
            return (
              <li key={str(row.id)} className="rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-xs">
                <p className="font-bold text-white">{str(row.full_name) || 'Contact'}</p>
                <p className="text-zinc-500">
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
