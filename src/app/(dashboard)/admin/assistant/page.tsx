import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { OwnerAssistantPanel } from '@/components/admin/owner-assistant-panel';

export default async function AdminAssistantPage() {
  const session = await getSessionWithProfile();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null)) redirect('/login');
  return (
    <div className='mx-auto max-w-2xl space-y-6 px-2'>
      <div className='text-center sm:text-left'>
        <p className='text-xs font-black uppercase tracking-[0.28em] text-gold-soft'>Operations AI</p>
        <h1 className='mt-2 text-2xl font-black text-white'>In-site assistant</h1>
        <p className='mt-2 max-w-xl text-sm text-zinc-400'>
          Quick answers from live CRM data — balances, schedule, mileage. Full Jarvis analytics ships in a later release.
        </p>
      </div>
      <OwnerAssistantPanel />
    </div>
  );
}
