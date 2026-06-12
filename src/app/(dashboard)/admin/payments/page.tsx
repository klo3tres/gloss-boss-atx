import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { reconcileStripeSessionAction, refundStripePaymentAction } from './payment-actions';
import { PaymentsManager } from '@/components/admin/payments-manager';

export const dynamic = 'force-dynamic';

type PayRow = Record<string, unknown>;

function money(cents: unknown) {
  return typeof cents === 'number' ? `$${(cents / 100).toFixed(2)}` : '—';
}

function str(v: unknown) {
  return v == null ? '' : String(v);
}

function chicago(v: unknown) {
  if (!v) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(str(v)));
}

export default async function AdminPaymentsPage() {
  const session = await getSessionWithProfile();
  const canView = Boolean(session.user && isAdminLevel(session.profile?.role ?? null));
  const admin = canView ? tryCreateAdminSupabase() : null;
  let rows: PayRow[] = [];
  let loadError: string | null = null;
  if (admin) {
    const [payments, appointments, fallbacks] = await Promise.all([
      admin.from('payments').select('*').order('created_at', { ascending: false }).limit(120),
      admin
        .from('appointments')
        .select('id, customer_id, guest_name, guest_email, guest_phone, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, service_slug, base_price_cents, deposit_amount_cents, payment_status, status, stripe_checkout_session_id, final_payment_checkout_session_id, scheduled_start, created_at')
        .order('created_at', { ascending: false })
        .limit(120),
      admin
        .from('booking_fallbacks')
        .select('id, guest_name, guest_email, guest_phone, vehicle_description, service_address, service_city, service_state, service_zip, service_slug, base_price_cents, deposit_amount_cents, payment_status, status, stripe_checkout_session_id, created_at')
        .order('created_at', { ascending: false })
        .limit(80),
    ]);
    if (payments.error) loadError = payments.error.message;
    const bySession = new Map<string, PayRow>();
    const apptById = new Map<string, PayRow>();
    const apptBySession = new Map<string, PayRow>();
    for (const a of appointments.data ?? []) {
      const r = a as PayRow;
      apptById.set(str(r.id), r);
      for (const sid of [str(r.stripe_checkout_session_id), str(r.final_payment_checkout_session_id)].filter(Boolean)) {
        apptBySession.set(sid, r);
      }
    }
    for (const p of payments.data ?? []) {
      const r = p as PayRow;
      const sid = str(r.stripe_checkout_session_id);
      const linked = apptById.get(str(r.appointment_id)) ?? apptBySession.get(sid) ?? {};
      if (sid) bySession.set(sid, r);
      rows.push({ source: 'payment', ...linked, ...r, customer_id: r.customer_id ?? linked.customer_id });
    }
    for (const a of appointments.data ?? []) {
      const r = a as PayRow;
      for (const sid of [str(r.stripe_checkout_session_id), str(r.final_payment_checkout_session_id)].filter(Boolean)) {
        if (!bySession.has(sid)) rows.push({ source: 'appointment_session', stripe_checkout_session_id: sid, appointment_id: r.id, ...r });
      }
    }
    for (const f of fallbacks.data ?? []) {
      const r = f as PayRow;
      const sid = str(r.stripe_checkout_session_id);
      if (sid && !bySession.has(sid)) rows.push({ source: 'fallback_session', fallback_booking_id: r.id, ...r });
    }
  }

  return (
    <DashboardShell title='Payments' subtitle='Live Stripe payment visibility, repair, and refund controls.' role='admin'>
      {!canView ? <p className='text-sm text-amber-200'>Admin access required.</p> : null}
      {loadError ? <p className='rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100'>{loadError}</p> : null}
      <section className='rounded-3xl border border-white/5 bg-zinc-950/40 p-6 shadow-xl backdrop-blur-md'>
        <PaymentsManager rows={rows as any} />
      </section>
    </DashboardShell>
  );
}

