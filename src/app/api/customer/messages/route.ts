import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { notifyBusinessOfContactMessage } from '@/lib/email/contact-notify';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export async function GET() {
  const session = await getSessionWithProfile();
  const email = session.user?.email?.trim().toLowerCase();
  if (!email || session.profile?.role !== 'customer') {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ messages: [] });

  const { data, error } = await admin
    .from('messages')
    .select('id, from_name, from_email, subject, body, message, status, created_at, admin_reply, replied_at')
    .eq('from_email', email)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ messages: [], warning: error.message });
  const messages = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: str(r.id),
      subject: str(r.subject) || 'Message',
      body: str(r.body || r.message),
      status: str(r.status),
      createdAt: str(r.created_at),
      adminReply: str(r.admin_reply) || null,
      repliedAt: str(r.replied_at) || null,
    };
  });
  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  const session = await getSessionWithProfile();
  const email = session.user?.email?.trim().toLowerCase();
  const name = session.profile?.full_name || session.user?.email?.split('@')[0] || 'Customer';
  if (!email || session.profile?.role !== 'customer') {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = (await request.json()) as { subject?: string; message?: string; appointmentId?: string };
  const message = str(body.message);
  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Messaging unavailable' }, { status: 503 });

  const row = {
    from_name: name,
    from_email: email,
    subject: str(body.subject) || 'Customer portal message',
    body: message,
    message,
    appointment_id: str(body.appointmentId) || null,
    status: 'new',
    direction: 'inbound',
  };

  const { error } = await admin.from('messages').insert(row);
  if (error) {
    const { error: err2 } = await admin.from('messages').insert({
      from_name: name,
      from_email: email,
      subject: row.subject,
      body: message,
      status: 'new',
    });
    if (err2) return NextResponse.json({ error: 'Could not send message' }, { status: 500 });
  }

  void notifyBusinessOfContactMessage({
    fromName: name,
    fromEmail: email,
    subject: row.subject,
    body: message,
  });

  return NextResponse.json({ ok: true });
}
