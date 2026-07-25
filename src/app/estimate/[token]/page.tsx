import { notFound } from 'next/navigation';
import { EstimatePublicClient } from '@/app/estimate/[token]/estimate-public-client';
import { loadEstimateByToken } from '@/lib/service-estimates';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function PublicEstimatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = tryCreateAdminSupabase();
  if (!admin) notFound();

  const estimate = await loadEstimateByToken(admin, token);
  if (!estimate) notFound();
  const now = new Date().toISOString();
  if (!estimate.viewedAt) {
    await admin.from('service_estimates').update({ viewed_at: now, status: estimate.status === 'sent' ? 'viewed' : estimate.status, updated_at: now }).eq('id', estimate.id);
    await admin.from('service_estimate_events').insert({ estimate_id: estimate.id, customer_id: estimate.customerId, event_type: 'viewed', provider_status: 'customer_viewed' });
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950 px-4 py-12">
      <EstimatePublicClient estimate={estimate} />
    </main>
  );
}
