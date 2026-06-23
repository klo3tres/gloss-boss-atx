import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { ReviewsManagerClient } from '@/components/admin/reviews-manager-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function AdminReviewsPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  const { data } = await admin
    .from('customer_reviews')
    .select('id, customer_name, rating, testimonial, published, source, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <DashboardShell title="Reviews" subtitle="Manual review manager — homepage testimonials" role={session.profile!.role as 'admin' | 'super_admin'}>
      <ReviewsManagerClient reviews={(data ?? []) as Parameters<typeof ReviewsManagerClient>[0]['reviews']} />
    </DashboardShell>
  );
}
