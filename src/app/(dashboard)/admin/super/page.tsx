import { notFound, redirect } from 'next/navigation';
import { getSessionWithProfile } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function SuperAdminDashboardPage() {
  const session = await getSessionWithProfile();
  if (!session.user || session.profile?.role !== 'super_admin') notFound();
  redirect('/admin/titan?workspace=today');
}
