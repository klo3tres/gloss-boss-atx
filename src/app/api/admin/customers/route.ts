import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { logSmsConsentChange, normalizeSmsConsentStatus } from '@/lib/sms-consent';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

export async function PATCH(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });
  }

  let body: {
    id?: string;
    full_name?: string;
    phone?: string;
    email?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    sms_consent?: boolean;
    sms_status?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const id = String(body.id ?? '').trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Customer id required' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.full_name === 'string') patch.full_name = body.full_name.trim() || null;
  if (typeof body.phone === 'string') patch.phone = body.phone.trim() || null;
  if (typeof body.email === 'string') patch.email = body.email.trim().toLowerCase() || null;
  if (typeof body.address_line1 === 'string') patch.address_line1 = body.address_line1.trim() || null;
  if (typeof body.address_line2 === 'string') patch.address_line2 = body.address_line2.trim() || null;
  if (typeof body.city === 'string') patch.city = body.city.trim() || null;
  if (typeof body.state === 'string') patch.state = body.state.trim() || null;
  if (typeof body.postal_code === 'string') patch.postal_code = body.postal_code.trim() || null;
  let smsConsentChanged = false;
  let previousSmsConsent: boolean | null = null;
  if (typeof body.sms_consent === 'boolean') {
    const { data: existing } = await admin.from('customers').select('sms_consent').eq('id', id).maybeSingle();
    previousSmsConsent = (existing as { sms_consent?: boolean | null } | null)?.sms_consent ?? null;
    smsConsentChanged = previousSmsConsent !== body.sms_consent;
    patch.sms_consent = body.sms_consent;
    patch.sms_consent_source = 'admin_update';
    patch.sms_consent_timestamp = new Date().toISOString();
    patch.sms_status = normalizeSmsConsentStatus(body.sms_consent);
    patch.sms_opt_out_timestamp = body.sms_consent ? null : new Date().toISOString();
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'No fields to update' }, { status: 400 });
  }

  const { error } = await admin.from('customers').update(patch).eq('id', id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  if (smsConsentChanged && typeof body.sms_consent === 'boolean') {
    await logSmsConsentChange(admin, {
      customerId: id,
      changedBy: gate.userId,
      source: 'admin_update',
      previousConsent: previousSmsConsent,
      newConsent: body.sms_consent,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip'),
      userAgent: request.headers.get('user-agent'),
      note: 'Admin updated SMS consent after explicit customer request.',
    });
  }
  revalidatePath('/admin/customers');
  revalidatePath(`/admin/customers/${id}`);
  return NextResponse.json({ ok: true });
}
