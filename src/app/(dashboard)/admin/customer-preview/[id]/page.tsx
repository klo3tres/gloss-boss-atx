import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { CustomerExperiencePreviewClient } from '@/components/admin/customer-experience-preview-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { loadCustomerExperienceDiagnostics } from '@/lib/customer-experience-diagnostics';
import { recordCustomerPortalEvent } from '@/lib/customer-portal-tracking';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function CustomerPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionWithProfile();
  if (!session.user) redirect('/login');
  if (!isAdminLevel(session.profile?.role)) redirect('/dashboard');
  const admin = tryCreateAdminSupabase();
  if (!admin) throw new Error('Customer preview is temporarily unavailable.');

  const { id } = await params;
  const diagnostics = await loadCustomerExperienceDiagnostics(admin, id);
  if (!diagnostics) notFound();

  const requestHeaders = await headers();
  const token = diagnostics.portalUrl
    ? new URL(diagnostics.portalUrl).searchParams.get('token')
    : '';
  await recordCustomerPortalEvent(admin, {
    appointmentId: id,
    token,
    eventType: 'admin_preview_opened',
    headers: requestHeaders,
    role: session.profile?.role,
    adminPreview: true,
    channelSource: 'owner_qa_toolkit',
  });

  return <CustomerExperiencePreviewClient diagnostics={diagnostics} />;
}
