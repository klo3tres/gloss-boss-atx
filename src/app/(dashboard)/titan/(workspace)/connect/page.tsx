import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveBusinessContext } from '@/lib/titan/business-context';
import { loadBusinessIntegrations } from '@/lib/titan/integrations';
import { TitanIntegrationsCenter } from '@/components/titan/titan-integrations-center';

export const dynamic = 'force-dynamic';

export default async function TitanConnectPage() {
  const admin = tryCreateAdminSupabase();
  const ctx = admin ? await resolveBusinessContext(admin) : null;
  if (!ctx || !admin) return null;

  const { integrations } = await loadBusinessIntegrations(admin, ctx.businessId);

  return <TitanIntegrationsCenter integrations={integrations} businessId={ctx.businessId} />;
}
