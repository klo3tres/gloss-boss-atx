import { redirect } from 'next/navigation';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveBusinessContext } from '@/lib/titan/business-context';
import { TitanPlatformShell } from '@/components/titan/titan-platform-shell';

export default async function TitanLayoutClient({ children }: { children: React.ReactNode }) {
  const session = await getSessionWithProfile();
  if (!session.user) redirect('/login?next=/titan');

  const admin = tryCreateAdminSupabase();
  const ctx = admin ? await resolveBusinessContext(admin) : null;
  if (!ctx) redirect('/titan/start');

  return <TitanPlatformShell business={ctx.business}>{children}</TitanPlatformShell>;
}
