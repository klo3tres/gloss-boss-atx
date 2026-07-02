import { NextResponse } from 'next/server';
import { isSchemaDriftError } from '@/lib/booking-server-shared';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { notifyBusinessOfContactMessage } from '@/lib/email/contact-notify';
import { emitOwnerNotification } from '@/lib/titan/owner-notification-router';

function cleanPhone(raw: string | undefined): string | null {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length >= 10) return d.length === 10 ? d : d.slice(-10);
  return null;
}

export async function POST(request: Request) {
  try {
    const { fromName, fromEmail, fromPhone, subject, body, appointmentId } = (await request.json()) as {
      fromName?: string;
      fromEmail?: string;
      fromPhone?: string;
      subject?: string;
      body?: string;
      appointmentId?: string | null;
    };

    if (!fromName || !fromEmail || !body) {
      return NextResponse.json({ error: 'Name, email, and message are required' }, { status: 400 });
    }

    const admin = tryCreateAdminSupabase();
    if (!admin) {
      console.warn('[api/messages] admin unavailable');
      return NextResponse.json(
        {
          error: 'Server not configured for messages',
          code: 'MISSING_SUPABASE_SERVICE_ROLE',
        },
        { status: 503 },
      );
    }

    const phone = cleanPhone(fromPhone);
    const email = fromEmail.trim().toLowerCase();

    const attempts: Record<string, unknown>[] = [
      {
        from_name: fromName.trim(),
        from_email: email,
        from_phone: phone,
        subject: subject ?? null,
        body: body.trim(),
        message: body.trim(),
        appointment_id: appointmentId ?? null,
        status: 'new',
      },
      {
        from_name: fromName.trim(),
        from_email: email,
        subject: subject ?? null,
        body: body.trim(),
        message: body.trim(),
        appointment_id: appointmentId ?? null,
        status: 'new',
      },
      {
        from_name: fromName.trim(),
        from_email: email,
        subject: subject ?? null,
        body: body.trim(),
        status: 'new',
      },
      {
        name: fromName.trim(),
        email,
        message: body.trim(),
        status: 'new',
      },
    ];

    let lastErr: string | null = null;
    let messageId: string | null = null;
    for (const row of attempts) {
      const { data, error } = await admin.from('messages').insert(row).select('id').maybeSingle();
      if (!error) {
        messageId = data?.id ? String(data.id) : null;
        const notify = await notifyBusinessOfContactMessage({
          fromName: fromName.trim(),
          fromEmail: email,
          subject: subject ?? null,
          body: body.trim(),
        });
        const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '');
        void emitOwnerNotification(admin, {
          eventType: 'high_confidence_lead',
          title: `New website message: ${fromName.trim()}`,
          body: `${fromName.trim()} <${email}>${subject?.trim() ? ` — ${subject.trim()}` : ''}\n\n${body.trim()}`,
          source: 'message_center',
          relatedType: 'message',
          relatedId: messageId ?? undefined,
          relatedUrl: `${appBase}/admin/messages`,
          emailStatus: notify.sent ? 'sent' : undefined,
        });
        return NextResponse.json({ ok: true, emailSent: notify.sent, emailError: notify.error ?? null, messageId });
      }
      lastErr = error.message;
      if (!isSchemaDriftError(error.message)) {
        console.error('[api/messages] insert', error.message);
        return NextResponse.json(
          { error: 'We could not save your message. Please call or email the shop directly.' },
          { status: 500 },
        );
      }
    }

    console.error('[api/messages] all insert attempts failed', lastErr);
    return NextResponse.json(
      { error: 'We could not save your message. Please call or email the shop directly.' },
      { status: 500 },
    );
  } catch (e) {
    console.error('[api/messages]', e);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
