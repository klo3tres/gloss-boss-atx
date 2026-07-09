import { redirect } from 'next/navigation';
import { OutboundMessageProvider } from '@/components/admin/outbound-message-provider';
import { getSessionWithProfile } from '@/lib/auth/session';

export default async function TitanRootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionWithProfile();
  if (!session.user) redirect('/login?next=/titan');

  return <OutboundMessageProvider>{children}</OutboundMessageProvider>;
}
