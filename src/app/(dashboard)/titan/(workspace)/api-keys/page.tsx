import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveBusinessContext } from '@/lib/titan/business-context';
import { listBusinessApiKeys } from '@/lib/titan/api-keys';
import { TitanApiKeysClient } from '@/components/titan/titan-api-keys-client';

export const dynamic = 'force-dynamic';

export default async function TitanApiKeysPage() {
  const admin = tryCreateAdminSupabase();
  const ctx = admin ? await resolveBusinessContext(admin) : null;
  if (!ctx || !admin) return null;

  const keys = await listBusinessApiKeys(admin, ctx.businessId);

  return <TitanApiKeysClient keys={keys} businessId={ctx.businessId} />;
}
