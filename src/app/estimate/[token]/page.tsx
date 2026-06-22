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

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950 px-4 py-12">
      <EstimatePublicClient estimate={estimate} />
    </main>
  );
}
