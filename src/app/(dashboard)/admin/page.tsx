import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

type ApptRow = {
  id: string;
  status: string;
  scheduled_start: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  service_slug: string;
  vehicle_class: string;
  base_price_cents: number | null;
  deposit_amount_cents: number | null;
  assigned_technician_id: string | null;
};

type FallbackRow = {
  id: string;
  status: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  scheduled_start: string | null;
  base_price_cents: number | null;
  deposit_amount_cents: number | null;
  created_at: string;
  assigned_technician_id: string | null;
};

function guestFromPayload(payload: unknown): { name: string | null; email: string | null; phone: string | null; service?: string } {
  if (!payload || typeof payload !== 'object') return { name: null, email: null, phone: null };
  const p = payload as Record<string, unknown>;
  const name =
    typeof p.guest_name === 'string'
      ? p.guest_name
      : typeof p.guestName === 'string'
        ? p.guestName
        : typeof p.name === 'string'
          ? p.name
          : null;
  const email = typeof p.guest_email === 'string' ? p.guest_email : typeof p.email === 'string' ? p.email : null;
  const phone = typeof p.guest_phone === 'string' ? p.guest_phone : typeof p.phone === 'string' ? p.phone : null;
  const service = typeof p.service_slug === 'string' ? p.service_slug : typeof p.serviceSlug === 'string' ? p.serviceSlug : undefined;
  return { name, email, phone, service };
}

export default async function AdminDashboardPage() {
  const session = await getSessionWithProfile();

  let appointments: ApptRow[] = [];
  let fallbacks: FallbackRow[] = [];
  let techNames: Record<string, string> = {};
  let loadErr: string | null = null;

  if (session.user && isAdminLevel(session.profile?.role ?? null)) {
    const admin = tryCreateAdminSupabase();
    if (!admin) {
      loadErr = 'Service role key missing — set SUPABASE_SERVICE_ROLE_KEY to load live operations data.';
    } else {
      const [apRes, fbRes, techRes] = await Promise.all([
        admin
          .from('appointments')
          .select(
            'id, status, scheduled_start, guest_name, guest_email, guest_phone, service_slug, vehicle_class, base_price_cents, deposit_amount_cents, assigned_technician_id',
          )
          .order('scheduled_start', { ascending: true })
          .limit(120),
        admin
          .from('booking_fallbacks')
          .select('id, status, payload, guest_name, guest_email, guest_phone, scheduled_start, base_price_cents, deposit_amount_cents, created_at, assigned_technician_id')
          .order('created_at', { ascending: false })
          .limit(80),
        admin.from('profiles').select('id, full_name, email').in('role', ['technician', 'admin', 'super_admin']).limit(200),
      ]);
      if (apRes.error) loadErr = apRes.error.message;
      else appointments = (apRes.data ?? []) as ApptRow[];

      if (!fbRes.error && fbRes.data) {
        fallbacks = (fbRes.data as Record<string, unknown>[]).map((r) => {
          const g = guestFromPayload(r.payload);
          return {
            id: String(r.id),
            status: String(r.status ?? 'pending'),
            guest_name: (r.guest_name as string | null) ?? g.name,
            guest_email: (r.guest_email as string | null) ?? g.email,
            guest_phone: (r.guest_phone as string | null) ?? g.phone,
            scheduled_start: (r.scheduled_start as string | null) ?? null,
            base_price_cents: typeof r.base_price_cents === 'number' ? r.base_price_cents : null,
            deposit_amount_cents: typeof r.deposit_amount_cents === 'number' ? r.deposit_amount_cents : null,
            created_at: String(r.created_at ?? ''),
            assigned_technician_id: (r.assigned_technician_id as string | null) ?? null,
          };
        });
      }

      for (const t of techRes.data ?? []) {
        const row = t as { id: string; full_name: string | null; email: string | null };
        techNames[row.id] = row.full_name?.trim() || row.email?.trim() || row.id.slice(0, 8);
      }
    }
  }

  const pendingFb = fallbacks.filter((f) => !['converted', 'completed', 'cancelled', 'succeeded', 'merged'].includes(String(f.status)));

  return (
    <DashboardShell
      title='Operations dashboard'
      subtitle='Live appointments and booking fallbacks — assign from Dispatch when ready.'
      role='admin'
    >
      {loadErr ? (
        <p className='mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100' role='alert'>
          {loadErr}
        </p>
      ) : null}

      <div className='mb-6 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wider'>
        <Link href='/admin/dispatch' className='rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-gold-soft'>
          Open dispatch board
        </Link>
        <Link href='/admin/messages' className='rounded-lg border border-white/15 px-4 py-2 text-zinc-300'>
          Message center
        </Link>
        <Link href='/admin/leads' className='rounded-lg border border-white/15 px-4 py-2 text-zinc-300'>
          Leads
        </Link>
        <Link href='/admin/payments' className='rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-emerald-200'>
          Payments
        </Link>
        <Link href='/admin/work-orders' className='rounded-lg border border-white/15 px-4 py-2 text-zinc-300'>
          Work Orders
        </Link>
        <Link href='/admin/customers' className='rounded-lg border border-white/15 px-4 py-2 text-zinc-300'>
          Customers
        </Link>
        <Link href='/admin/agreements' className='rounded-lg border border-white/15 px-4 py-2 text-zinc-300'>
          Agreements
        </Link>
        <Link href='/admin/intake' className='rounded-lg border border-white/15 px-4 py-2 text-zinc-300'>
          Intake
        </Link>
        <Link href='/admin/booking-health' className='rounded-lg border border-white/15 px-4 py-2 text-zinc-300'>
          Booking Health
        </Link>
        <Link href='/admin/services' className='rounded-lg border border-white/15 px-4 py-2 text-zinc-300'>
          Services & Pricing
        </Link>
        <Link href='/admin/pricing' className='rounded-lg border border-white/15 px-4 py-2 text-zinc-300'>
          Promotions
        </Link>
        <Link href='/admin/system-status' className='rounded-lg border border-white/15 px-4 py-2 text-zinc-300'>
          System Status
        </Link>
      </div>

      {pendingFb.length > 0 ? (
        <div className='mb-8 rounded-2xl border border-amber-500/35 bg-amber-500/5 p-5'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-amber-200'>Booking fallbacks · needs review</p>
          <p className='mt-1 text-sm text-zinc-400'>
            These records did not fully convert to appointments. Review payload in Supabase or booking diagnostics, then create a proper job.
          </p>
          <ul className='mt-4 space-y-2 text-sm'>
            {pendingFb.slice(0, 12).map((f) => (
              <li key={f.id} className='rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-zinc-200'>
                <span className='font-mono text-xs text-zinc-500'>{f.id.slice(0, 8)}…</span>{' '}
                <span className='text-white'>{f.guest_name ?? 'Guest'}</span> · {f.guest_email ?? '—'} ·{' '}
                {f.scheduled_start ? new Date(f.scheduled_start).toLocaleString() : 'No time'} ·{' '}
                <span className='text-amber-200/90'>{f.status}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>Upcoming & active appointments</p>
        <p className='mt-1 text-sm text-zinc-400'>
          {appointments.length} appointment(s) · {fallbacks.length} fallback row(s) loaded.
        </p>
        <div className='gb-admin-table-wrap mt-4'>
          <table className='w-full min-w-[880px] border-collapse text-left text-sm'>
            <thead>
              <tr className='border-b border-white/10 text-xs uppercase tracking-wider text-zinc-500'>
                <th className='py-2 pr-3'>When</th>
                <th className='py-2 pr-3'>Customer</th>
                <th className='py-2 pr-3'>Phone</th>
                <th className='py-2 pr-3'>Service</th>
                <th className='py-2 pr-3'>Class</th>
                <th className='py-2 pr-3'>Price</th>
                <th className='py-2 pr-3'>Deposit</th>
                <th className='py-2 pr-3'>Status</th>
                <th className='py-2'>Tech</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id} className='border-b border-white/5 text-zinc-200'>
                  <td className='py-2 pr-3 whitespace-nowrap'>{new Date(a.scheduled_start).toLocaleString()}</td>
                  <td className='py-2 pr-3'>
                    <span className='font-semibold text-white'>{a.guest_name ?? '—'}</span>
                    <br />
                    <span className='text-xs text-zinc-500'>{a.guest_email ?? ''}</span>
                  </td>
                  <td className='py-2 pr-3 text-xs'>{a.guest_phone ?? '—'}</td>
                  <td className='py-2 pr-3'>{a.service_slug}</td>
                  <td className='py-2 pr-3'>{a.vehicle_class}</td>
                  <td className='py-2 pr-3'>
                    {typeof a.base_price_cents === 'number' ? `$${(a.base_price_cents / 100).toFixed(0)}` : '—'}
                  </td>
                  <td className='py-2 pr-3'>
                    {typeof a.deposit_amount_cents === 'number' ? `$${(a.deposit_amount_cents / 100).toFixed(2)}` : '—'}
                  </td>
                  <td className='py-2 pr-3'>
                    <span className='rounded-full border border-gold/30 px-2 py-0.5 text-[10px] font-bold uppercase text-gold-soft'>{a.status}</span>
                  </td>
                  <td className='py-2 text-xs text-zinc-400'>
                    {a.assigned_technician_id ? techNames[a.assigned_technician_id] ?? a.assigned_technician_id.slice(0, 8) + '…' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {appointments.length === 0 ? (
            <p className='mt-4 text-sm text-zinc-500'>No appointments in range — new bookings appear here automatically.</p>
          ) : null}
        </div>
      </div>
    </DashboardShell>
  );
}
