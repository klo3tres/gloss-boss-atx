import { NextResponse } from 'next/server';
import { notifyBusinessNewBookingFull } from '@/lib/business-booking-notify';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });

  let body: {
    companyName?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    fleetSize?: string;
    message?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const companyName = String(body.companyName ?? '').trim();
  const contactName = String(body.contactName ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const phone = String(body.phone ?? '').trim();
  const fleetSize = String(body.fleetSize ?? '').trim();
  const message = String(body.message ?? '').trim();

  if (!companyName || !contactName || !email.includes('@')) {
    return NextResponse.json({ error: 'Company, contact name, and valid email required.' }, { status: 400 });
  }

  const row = {
    company_name: companyName,
    contact_name: contactName,
    email,
    phone: phone || null,
    fleet_size: fleetSize || null,
    message: message || null,
    status: 'new',
  };

  const { error } = await admin.from('fleet_inquiries').insert(row);
  if (error && !/fleet_inquiries|does not exist/i.test(error.message)) {
    console.warn('[fleet-inquiry] insert', error.message);
  }

  try {
    await notifyBusinessNewBookingFull({
      eventKind: 'quote_request',
      appointmentId: '00000000-0000-0000-0000-000000000000',
      guestName: `${contactName} (${companyName})`,
      guestEmail: email,
      guestPhone: phone || '—',
      whenIso: new Date().toISOString(),
      totalCents: 0,
      depositCents: 0,
      vehicles: fleetSize ? `Fleet size: ${fleetSize}` : 'Fleet inquiry',
      serviceAddress: null,
      extraNote: message || 'Fleet quote request from /services',
      bookingNumber: 'FLEET',
    });
  } catch (e) {
    console.warn('[fleet-inquiry] notify', e);
  }

  return NextResponse.json({ ok: true, message: 'Thanks — we will reach out within one business day.' });
}
