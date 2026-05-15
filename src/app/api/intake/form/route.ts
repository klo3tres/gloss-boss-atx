import { NextResponse } from 'next/server';
import { sanitizeIntakeCmsHtml } from '@/lib/intake-html';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getStripeSdk } from '@/lib/stripe/stripeService';

export const runtime = 'nodejs';

const DEFAULT_FIELDS = [
  { name: 'vehicle_year_make_model', label: 'Year / Make / Model', required: true },
  { name: 'vehicle_color', label: 'Color', required: true },
  { name: 'parking_location', label: 'Service location (address)', required: true },
  { name: 'special_requests', label: 'Special requests', required: false },
];

async function verifyPaidSession(admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>, appointmentId: string, sessionId: string) {
  const stripe = await getStripeSdk(admin);
  if (!stripe) return false;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return session.payment_status === 'paid' && session.metadata?.appointment_id === appointmentId;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const appointmentId = url.searchParams.get('appointment_id')?.trim();
  const token = url.searchParams.get('token')?.trim();
  const sessionId = url.searchParams.get('session_id')?.trim();

  if (!appointmentId || !token) {
    return NextResponse.json({ ok: false, error: 'Missing parameters' }, { status: 400 });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Server unavailable' }, { status: 503 });
  }

  const { data: appt, error: apptErr } = await admin
    .from('appointments')
    .select('id, access_token, status, stripe_checkout_session_id')
    .eq('id', appointmentId)
    .maybeSingle();

  if (apptErr || !appt || appt.access_token !== token) {
    return NextResponse.json({ ok: false, error: 'Invalid booking link' }, { status: 403 });
  }

  const paidStatuses = ['deposit_paid', 'confirmed', 'assigned', 'in_progress', 'completed'];
  let paymentOk = paidStatuses.includes(String(appt.status));
  if (!paymentOk && sessionId) {
    paymentOk = await verifyPaidSession(admin, appointmentId, sessionId);
    if (paymentOk) {
      await admin
        .from('appointments')
        .update({ status: 'deposit_paid', updated_at: new Date().toISOString() })
        .eq('id', appointmentId)
        .eq('status', 'awaiting_payment');
    }
  }

  if (!paymentOk) {
    return NextResponse.json({ ok: false, error: 'Complete payment before intake' }, { status: 400 });
  }

  const { data: existing } = await admin.from('intake_submissions').select('id').eq('appointment_id', appointmentId).maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, alreadySubmitted: true, fields: DEFAULT_FIELDS });
  }

  let html: string | null = null;
  let cmsHtmlRejected = false;
  try {
    const { data: doc } = await admin
      .from('cms_documents')
      .select('file_url')
      .eq('category', 'intake')
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (doc?.file_url && typeof doc.file_url === 'string') {
      const res = await fetch(doc.file_url, { cache: 'no-store' });
      if (res.ok) {
        const raw = await res.text();
        const safe = sanitizeIntakeCmsHtml(raw);
        if (safe) html = safe;
        else cmsHtmlRejected = true;
      }
    }
  } catch {
    /* optional HTML template */
  }

  let fields = DEFAULT_FIELDS;
  try {
    const { data: setting } = await admin.from('site_settings').select('value').eq('key', 'intake_form_fields').maybeSingle();
    if (setting?.value) {
      const parsed = JSON.parse(String(setting.value));
      if (Array.isArray(parsed)) fields = parsed;
    }
  } catch {
    /* use defaults */
  }

  return NextResponse.json({ ok: true, html, cmsHtmlRejected, fields, alreadySubmitted: false });
}
