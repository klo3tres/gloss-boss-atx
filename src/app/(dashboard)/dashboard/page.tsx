import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { CustomerDashboardClient } from '@/components/dashboard/customer-dashboard-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';



export const dynamic = 'force-dynamic';



type ApptRow = {

  id: string;

  status: string;

  scheduled_start: string;

  service_slug: string;

  vehicle_class: string;

  base_price_cents: number;

  deposit_amount_cents: number;

  job_started_at: string | null;

  job_completed_at: string | null;
  booking_vehicles?: unknown;
  service_address?: string | null;
  service_city?: string | null;
  service_state?: string | null;
  service_zip?: string | null;
  balance_due_cents?: number | null;
  payment_status?: string | null;
  guest_email?: string | null;

};



type TimelineRow = {

  appointment_id: string;

  event_type: string;

  created_at: string;

  meta: Record<string, unknown> | null;

};



type MediaRow = {

  appointment_id: string;

  file_url: string;

  category: string;

  visible_to_customer: boolean | null;

};

type PaymentRow = {
  appointment_id: string;
  amount_cents: number;
  status: string;
  payment_method: string | null;
  paid_at: string | null;
};

type ReceiptRow = {
  appointment_id: string;
  receipt_number: string | null;
  amount_cents: number;
  payment_method: string | null;
  created_at: string;
};

type AgreementRow = {
  id: string;
  appointment_id: string;
  signed_at: string | null;
};



function friendlyEventLabel(t: string): string {

  return t.replace(/_/g, ' ');

}

function chicago(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}



export default async function CustomerDashboardRootPage() {

  const session = await getSessionWithProfile();

  const supabase = await createSupabaseServerClient();



  let appointments: ApptRow[] = [];

  const eventsByAppt = new Map<string, TimelineRow[]>();

  const photosByAppt = new Map<string, MediaRow[]>();
  const paymentsByAppt = new Map<string, PaymentRow[]>();
  const receiptsByAppt = new Map<string, ReceiptRow[]>();
  const agreementByAppt = new Map<string, AgreementRow>();



  if (supabase && session.user) {

    const { data } = await supabase

      .from('appointments')

      .select(

        'id, status, scheduled_start, service_slug, vehicle_class, booking_vehicles, service_address, service_city, service_state, service_zip, base_price_cents, deposit_amount_cents, balance_due_cents, payment_status, job_started_at, job_completed_at',

      )

      .order('scheduled_start', { ascending: false })

      .limit(40);

    appointments = (data ?? []) as ApptRow[];



    const ids = appointments.map((a) => a.id);

    if (ids.length > 0) {

      const [evRes, medRes, payRes, agRes, receiptRes] = await Promise.all([

        supabase

          .from('job_timeline_events')

          .select('appointment_id, event_type, created_at, meta')

          .in('appointment_id', ids)

          .order('created_at', { ascending: false })

          .limit(400),

        supabase

          .from('job_media')

          .select('appointment_id, file_url, category, visible_to_customer')

          .in('appointment_id', ids)

          .order('created_at', { ascending: false })

          .limit(200),
        supabase
          .from('payments')
          .select('appointment_id, amount_cents, status, payment_method, paid_at')
          .in('appointment_id', ids)
          .order('paid_at', { ascending: false })
          .limit(100),
        supabase
          .from('signed_agreements')
          .select('id, appointment_id, signed_at')
          .in('appointment_id', ids)
          .order('signed_at', { ascending: false })
          .limit(100),
        supabase
          .from('receipts')
          .select('appointment_id, receipt_number, amount_cents, payment_method, created_at')
          .in('appointment_id', ids)
          .order('created_at', { ascending: false })
          .limit(100),

      ]);



      for (const row of (evRes.data ?? []) as TimelineRow[]) {

        const list = eventsByAppt.get(row.appointment_id) ?? [];

        if (list.length < 12) list.push(row);

        eventsByAppt.set(row.appointment_id, list);

      }



      for (const row of (medRes.data ?? []) as MediaRow[]) {

        if (!row.visible_to_customer) continue;

        const list = photosByAppt.get(row.appointment_id) ?? [];

        if (list.length < 8) list.push(row);

        photosByAppt.set(row.appointment_id, list);

      }

      for (const row of (payRes.data ?? []) as PaymentRow[]) {
        const list = paymentsByAppt.get(row.appointment_id) ?? [];
        list.push(row);
        paymentsByAppt.set(row.appointment_id, list);
      }

      for (const row of (agRes.data ?? []) as AgreementRow[]) {
        if (!agreementByAppt.has(row.appointment_id)) agreementByAppt.set(row.appointment_id, row);
      }

      for (const row of (receiptRes.data ?? []) as ReceiptRow[]) {
        const list = receiptsByAppt.get(row.appointment_id) ?? [];
        list.push(row);
        receiptsByAppt.set(row.appointment_id, list);
      }

    }

  }



  const upcoming = appointments.filter((a) => !['completed', 'cancelled'].includes(a.status)).slice(0, 8);

  const history = appointments.filter((a) => ['completed', 'cancelled'].includes(a.status)).slice(0, 8);

  const liveJob = upcoming.find((a) => a.status === 'in_progress' || (a.job_started_at && !a.job_completed_at));



  const liveEvents = liveJob ? eventsByAppt.get(liveJob.id) ?? [] : [];
  const vehicleTotal = appointments.reduce((sum, a) => sum + (Array.isArray(a.booking_vehicles) ? a.booking_vehicles.length : 1), 0);
  const receiptTotal = Array.from(receiptsByAppt.values()).reduce((sum, rows) => sum + rows.length, 0) || Array.from(paymentsByAppt.values()).reduce((sum, rows) => sum + rows.length, 0);
  const photoTotal = Array.from(photosByAppt.values()).reduce((sum, rows) => sum + rows.length, 0);
  const agreementTotal = agreementByAppt.size;

  const mapToRecord = <T,>(m: Map<string, T[]>) => {
    const o: Record<string, T[]> = {};
    m.forEach((v, k) => {
      o[k] = v;
    });
    return o;
  };
  const agreementRecord: Record<string, boolean> = {};
  const agreementHrefByAppt: Record<string, string> = {};
  agreementByAppt.forEach((row, k) => {
    agreementRecord[k] = true;
    agreementHrefByAppt[k] = `/dashboard/agreements/${encodeURIComponent(`signed_agreements:${row.id}`)}`;
  });

  return (
    <DashboardShell title='Your dashboard' subtitle='Garage, appointments, receipts, agreements, and live updates.' role='customer'>
      <CustomerDashboardClient
        liveJob={liveJob ?? null}
        liveEvents={liveEvents}
        upcoming={upcoming}
        history={history}
        eventsByAppt={mapToRecord(eventsByAppt)}
        paymentsByAppt={mapToRecord(paymentsByAppt)}
        receiptsByAppt={mapToRecord(receiptsByAppt)}
        agreementByAppt={agreementRecord}
        agreementHrefByAppt={agreementHrefByAppt}
        photosByAppt={mapToRecord(photosByAppt)}
        vehicleTotal={vehicleTotal}
        receiptTotal={receiptTotal}
        photoTotal={photoTotal}
        agreementTotal={agreementTotal}
        appointmentCount={appointments.length}
      />
    </DashboardShell>
  );
}
