import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { notifyBusinessOfContactMessage } from '@/lib/email/contact-notify';

export async function POST(request: Request) {
  try {
    const { fromName, fromEmail, subject, body, appointmentId } = (await request.json()) as {
      fromName?: string;
      fromEmail?: string;
      subject?: string;
      body?: string;
      appointmentId?: string | null;
    };

    if (!fromName || !fromEmail || !body) {
      return NextResponse.json({ error: 'Name, email, and message are required' }, { status: 400 });
    }

    const admin = tryCreateAdminSupabase();
    if (!admin) {
      console.error('[api/messages] Supabase admin not configured');
      return NextResponse.json(
        {
          error: 'Server not configured for messages',
          code: 'MISSING_SUPABASE_SERVICE_ROLE',
        },
        { status: 503 }
      );
    }

    const { error } = await admin.from('messages').insert({
      from_name: fromName,
      from_email: fromEmail.trim().toLowerCase(),
      subject: subject ?? null,
      body,
      appointment_id: appointmentId ?? null,
      status: 'new',
    });

    if (error) {
      console.error(error);
      return NextResponse.json({ error: 'Could not save message' }, { status: 500 });
    }

    const notify = await notifyBusinessOfContactMessage({
      fromName,
      fromEmail: fromEmail.trim().toLowerCase(),
      subject: subject ?? null,
      body,
    });

    return NextResponse.json({ ok: true, emailSent: notify.sent, emailError: notify.error ?? null });
  } catch (e) {
    console.error('[api/messages]', e);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
