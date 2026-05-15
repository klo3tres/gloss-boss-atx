import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ appointmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Post-checkout step: same signing flow as /book/complete (keeps Stripe session_id + token in query string).
 */
export default async function AcknowledgementPage({ params, searchParams }: Props) {
  const { appointmentId } = await params;
  const sp = await searchParams;
  const token = typeof sp.token === 'string' ? sp.token : '';
  const sessionId = typeof sp.session_id === 'string' ? sp.session_id : '';
  if (!token || !sessionId) {
    redirect('/book?error=missing_acknowledgement_context');
  }
  redirect(
    `/agreement?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}&session_id=${encodeURIComponent(sessionId)}`,
  );
}
