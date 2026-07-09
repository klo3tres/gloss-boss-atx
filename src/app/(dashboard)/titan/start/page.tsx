import { redirect } from 'next/navigation';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveBusinessContext } from '@/lib/titan/business-context';
import { TitanOnboardingStart } from '@/components/titan/titan-onboarding-start';

export const dynamic = 'force-dynamic';

export default async function TitanStartPage() {
  const session = await getSessionWithProfile();
  if (!session.user) redirect('/login?next=/titan/start');

  const admin = tryCreateAdminSupabase();
  const ctx = admin ? await resolveBusinessContext(admin) : null;

  return (
    <div className="min-h-screen bg-[#070708] px-4 py-10 text-zinc-100 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-400/90">Titan OS</p>
        <TitanOnboardingStart hasBusiness={Boolean(ctx?.business)} />
        {ctx?.business.isPlatformTenant ? (
          <p className="mt-4 text-xs text-zinc-500">
            Gloss Boss is the first Titan tenant. Continue to{' '}
            <a href="/titan" className="text-amber-200 underline">
              Titan home
            </a>{' '}
            or{' '}
            <a href="/admin" className="text-amber-200 underline">
              Gloss Boss admin
            </a>
            .
          </p>
        ) : null}
      </div>
    </div>
  );
}
