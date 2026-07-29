import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { canAccessCustomerPortal } from '@/lib/auth/customer-portal';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { notifyBusinessOfContactMessage } from '@/lib/email/contact-notify';
import { resendDomainVerified } from '@/lib/resend-config';
import { customerOwnsWorkOrder, resolveAuthenticatedCustomer } from '@/lib/customer-account';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

const MESSAGE_SELECT =
  'id, customer_id, thread_id, from_name, from_email, subject, body, message, status, direction, created_at, admin_reply, replied_at';

function normalizeMessage(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    appointmentId: str(row.thread_id) || null,
    subject: str(row.subject) || 'Message',
    body: str(row.body || row.message),
    status: str(row.status),
    direction: str(row.direction) || 'inbound',
    createdAt: str(row.created_at),
    adminReply: str(row.admin_reply) || null,
    repliedAt: str(row.replied_at) || null,
  };
}

export async function GET() {
  const session = await getSessionWithProfile();
  const email = session.user?.email?.trim().toLowerCase();
  if (!session.user?.id || !email || !canAccessCustomerPortal(session.profile?.role)) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Messaging is temporarily unavailable.' }, { status: 503 });
  const customer = await resolveAuthenticatedCustomer(admin, {
    authUserId: session.user.id,
    email,
    fullName: session.profile?.full_name,
  });
  if (!customer?.id) {
    return NextResponse.json({ error: 'Your customer profile could not be loaded.' }, { status: 409 });
  }

  const [linked, legacy] = await Promise.all([
    admin.from('messages').select(MESSAGE_SELECT).eq('customer_id', customer.id).limit(100),
    admin
      .from('messages')
      .select(MESSAGE_SELECT)
      .is('customer_id', null)
      .eq('from_email', email)
      .limit(100),
  ]);
  if (linked.error || legacy.error) {
    return NextResponse.json({ error: 'Your messages could not be loaded. Please try again.' }, { status: 500 });
  }
  const byId = new Map<string, Record<string, unknown>>();
  for (const row of [...(linked.data ?? []), ...(legacy.data ?? [])]) {
    byId.set(String(row.id), row as Record<string, unknown>);
  }
  const messages = [...byId.values()]
    .sort((a, b) => Date.parse(str(b.created_at)) - Date.parse(str(a.created_at)))
    .slice(0, 100)
    .map(normalizeMessage);
  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  const session = await getSessionWithProfile();
  const email = session.user?.email?.trim().toLowerCase();
  const name = session.profile?.full_name || session.user?.email?.split('@')[0] || 'Customer';
  if (!session.user?.id || !email || !canAccessCustomerPortal(session.profile?.role)) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    subject?: string;
    message?: string;
    appointmentId?: string;
  };
  const message = str(body.message).slice(0, 5000);
  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Messaging unavailable' }, { status: 503 });
  const customer = await resolveAuthenticatedCustomer(admin, {
    authUserId: session.user.id,
    email,
    fullName: session.profile?.full_name,
  });
  if (!customer?.id) {
    return NextResponse.json({ error: 'Your customer profile could not be loaded.' }, { status: 409 });
  }

  const appointmentId = str(body.appointmentId);
  if (appointmentId) {
    const { data: appointment } = await admin
      .from('appointments')
      .select('customer_id, guest_email')
      .eq('id', appointmentId)
      .maybeSingle();
    if (
      !appointment ||
      !(await customerOwnsWorkOrder(admin, {
        authUserId: session.user.id,
        email,
        customerId: appointment.customer_id,
        guestEmail: appointment.guest_email,
      }))
    ) {
      return NextResponse.json({ error: 'This appointment is not connected to your account.' }, { status: 403 });
    }
  }

  const row = {
    from_name: name,
    from_email: email,
    customer_id: customer.id,
    subject: str(body.subject).slice(0, 160) || 'Customer portal message',
    body: message,
    message,
    thread_id: appointmentId || null,
    status: 'new',
    direction: 'inbound',
  };

  let inserted = await admin.from('messages').insert(row).select('id, created_at').maybeSingle();
  if (inserted.error) {
    inserted = await admin
      .from('messages')
      .insert({
        from_name: name,
        from_email: email,
        customer_id: customer.id,
        thread_id: appointmentId || null,
        subject: row.subject,
        body: message,
        status: 'new',
      })
      .select('id, created_at')
      .maybeSingle();
    if (inserted.error) return NextResponse.json({ error: 'Could not send message' }, { status: 500 });
  }

  const customerFlags = await admin
    .from('customers')
    .select('is_test')
    .eq('id', customer.id)
    .maybeSingle();
  const isQa = customerFlags.data?.is_test === true;
  const notify = isQa
    ? { sent: false, error: 'QA notification suppressed' }
    : await notifyBusinessOfContactMessage({
        fromName: name,
        fromEmail: email,
        subject: row.subject,
        body: message,
      });

  const emailSkipped = !notify.sent;
  const emailNote =
    emailSkipped && !process.env.RESEND_API_KEY?.trim()
      ? 'email notification skipped (Resend not configured)'
      : emailSkipped && !resendDomainVerified()
        ? 'email notification skipped (domain not verified)'
        : emailSkipped
          ? 'email notification skipped'
          : null;

  return NextResponse.json({
    ok: true,
    id: inserted.data?.id,
    createdAt: inserted.data?.created_at,
    emailNotificationSkipped: emailSkipped,
    note: isQa ? 'test notification skipped' : emailNote,
  });
}
