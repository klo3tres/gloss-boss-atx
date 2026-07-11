import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ appointmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Legacy acknowledgment route → canonical /agreement.
 * Token-only links work (no Stripe session required for later resends).
 */
export default async function AcknowledgementPage({ params, searchParams }: Props) {
  const { appointmentId } = await params;
  const sp = await searchParams;
  const token = typeof sp.token === 'string' ? sp.token : '';
  const sessionId = typeof sp.session_id === 'string' ? sp.session_id : '';
  const error = typeof sp.error === 'string' ? sp.error : '';

  if (!token) {
    redirect(`/agreement?error=${encodeURIComponent(error || 'missing_token')}&appointment_id=${encodeURIComponent(appointmentId)}`);
  }

  const q = new URLSearchParams();
  q.set('appointment_id', appointmentId);
  q.set('token', token);
  if (sessionId) q.set('session_id', sessionId);
  if (error) q.set('error', error);
  redirect(`/agreement?${q.toString()}`);
}
