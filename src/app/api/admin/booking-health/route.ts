import { NextResponse } from 'next/server';
import { getBookingHealthSnapshot } from '@/lib/booking-diagnostics';
import { requireSuperAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

export async function GET() {
  const gate = await requireSuperAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const admin = tryCreateAdminSupabase();
  const stripeSecret = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  const stripeWebhook = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
  const resend = Boolean(process.env.RESEND_API_KEY?.trim());
  const twilio =
    Boolean(process.env.TWILIO_ACCOUNT_SID?.trim()) &&
    Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()) &&
    Boolean(process.env.TWILIO_FROM_NUMBER?.trim() ?? process.env.TWILIO_FROM?.trim());

  if (!admin) {
    return NextResponse.json({
      ok: true,
      supabase: false,
      serviceRole: false,
      stripe: { configured: stripeSecret, webhook: stripeWebhook },
      resend,
      twilio,
      snapshot: null,
      pendingFallbacks: null,
      activeFallbacks: null,
      expiredFallbacks: null,
      lastFallbackError: null,
      recentFallbacks: [],
      lastBookingError: null,
    });
  }

  const snap = await getBookingHealthSnapshot(admin);

  const tenAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  try {
    await admin
      .from('booking_fallbacks')
      .update({ status: 'expired', updated_at: nowIso })
      .eq('status', 'pending')
      .is('converted_appointment_id', null)
      .lt('created_at', tenAgo);
  } catch {
    /* non-fatal */
  }

  let pendingFallbacks: number | null = null;
  let expiredFallbacks: number | null = null;
  let activeFallbacks: number | null = null;
  try {
    const c = await admin.from('booking_fallbacks').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    pendingFallbacks = typeof c.count === 'number' ? c.count : null;
  } catch {
    pendingFallbacks = null;
  }
  try {
    const e = await admin.from('booking_fallbacks').select('id', { count: 'exact', head: true }).eq('status', 'expired');
    expiredFallbacks = typeof e.count === 'number' ? e.count : null;
  } catch {
    expiredFallbacks = null;
  }
  try {
    const a = await admin
      .from('booking_fallbacks')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'open', 'needs_review']);
    activeFallbacks = typeof a.count === 'number' ? a.count : null;
  } catch {
    activeFallbacks = null;
  }

  let lastFallbackError: { message: string | null; created_at: string | null } | null = null;
  try {
    const { data } = await admin
      .from('booking_fallbacks')
      .select('promotion_error, last_failure_detail, created_at')
      .order('created_at', { ascending: false })
      .limit(15);
    for (const raw of data ?? []) {
      const r = raw as Record<string, unknown>;
      const msg =
        (r.last_failure_detail != null && String(r.last_failure_detail).trim()) ||
        (r.promotion_error != null && String(r.promotion_error).trim()) ||
        '';
      if (msg) {
        lastFallbackError = {
          message: msg,
          created_at: r.created_at != null ? String(r.created_at) : null,
        };
        break;
      }
    }
  } catch {
    lastFallbackError = null;
  }

  let lastBookingError: { message: string | null; created_at: string | null; stage: string | null } | null = null;
  try {
    const { data } = await admin
      .from('booking_errors')
      .select('error_message, created_at, stage')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && typeof data === 'object') {
      const r = data as Record<string, unknown>;
      lastBookingError = {
        message: r.error_message != null ? String(r.error_message) : null,
        created_at: r.created_at != null ? String(r.created_at) : null,
        stage: r.stage != null ? String(r.stage) : null,
      };
    }
  } catch {
    lastBookingError = null;
  }

  let recentFallbacks: {
    id: string;
    guest_name: string | null;
    guest_email: string | null;
    guest_phone: string | null;
    status: string | null;
    deposit_amount_cents: number | null;
    created_at: string | null;
    converted_appointment_id: string | null;
    reviewed_at: string | null;
    archived_at: string | null;
    promotion_error: string | null;
  }[] = [];
  try {
    const { data } = await admin
      .from('booking_fallbacks')
      .select(
        'id, guest_name, guest_email, guest_phone, status, deposit_amount_cents, created_at, converted_appointment_id, reviewed_at, archived_at, promotion_error, last_failure_detail',
      )
      .order('created_at', { ascending: false })
      .limit(20);
    recentFallbacks = (data ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      return {
        id: String(r.id ?? ''),
        guest_name: r.guest_name != null ? String(r.guest_name) : null,
        guest_email: r.guest_email != null ? String(r.guest_email) : null,
        guest_phone: r.guest_phone != null ? String(r.guest_phone) : null,
        status: r.status != null ? String(r.status) : null,
        deposit_amount_cents: typeof r.deposit_amount_cents === 'number' ? r.deposit_amount_cents : null,
        created_at: r.created_at != null ? String(r.created_at) : null,
        converted_appointment_id: r.converted_appointment_id != null ? String(r.converted_appointment_id) : null,
        reviewed_at: r.reviewed_at != null ? String(r.reviewed_at) : null,
        archived_at: r.archived_at != null ? String(r.archived_at) : null,
        promotion_error:
          (r.last_failure_detail != null && String(r.last_failure_detail)) ||
          (r.promotion_error != null ? String(r.promotion_error) : null),
      };
    });
  } catch {
    recentFallbacks = [];
  }

  return NextResponse.json({
    ok: true,
    supabase: true,
    serviceRole: true,
    stripe: { configured: stripeSecret, webhook: stripeWebhook },
    resend,
    twilio,
    snapshot: snap,
    pendingFallbacks,
    activeFallbacks,
    expiredFallbacks,
    lastFallbackError,
    recentFallbacks,
    lastBookingError,
  });
}
