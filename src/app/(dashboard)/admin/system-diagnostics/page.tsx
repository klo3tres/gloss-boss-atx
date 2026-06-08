import Link from 'next/link';
import { notFound } from 'next/navigation';
import Stripe from 'stripe';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { buildRevenueDiagnostics, fetchPaymentsSince } from '@/lib/revenue-metrics';
import { startOfMonthIso } from '@/lib/revenue-metrics';
import { displayMoney } from '@/lib/display-format';
import { isTestLikeJob } from '@/lib/tech-job-filters';

export const dynamic = 'force-dynamic';

type CountResult = { count: number; error: string | null };
type AnyRow = Record<string, unknown>;

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function yesNo(v: boolean) {
  return v ? 'Yes' : 'No';
}

function prettyJson(v: unknown) {
  try {
    return JSON.stringify(v, null, 2).slice(0, 1200);
  } catch {
    return String(v).slice(0, 1200);
  }
}

function isOkStatus(status: unknown) {
  const st = str(status).toLowerCase();
  return ['succeeded', 'paid', 'comped', 'manual_comped'].includes(st);
}

function isVoided(row: AnyRow) {
  return Boolean(row.voided_at || row.voided === true) || str(row.status).toLowerCase() === 'voided';
}

function paymentDuplicateKey(row: AnyRow) {
  const stripeId = str(row.stripe_payment_intent_id) || str(row.stripe_checkout_session_id);
  if (stripeId) return `stripe:${stripeId}`;
  return [
    str(row.appointment_id),
    str(row.customer_id),
    str(row.amount_cents),
    str(row.payment_method || row.payment_kind).toLowerCase(),
    str(row.paid_at || row.created_at).slice(0, 16),
  ].join('|');
}

async function safeCount(admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>, table: string): Promise<CountResult> {
  const res = await admin.from(table).select('id', { count: 'exact', head: true });
  return { count: res.count ?? 0, error: res.error?.message ?? null };
}

async function safeRows(admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>, table: string, select = '*', limit = 5000) {
  const res = await admin.from(table).select(select).limit(limit);
  return { rows: ((res.data ?? []) as unknown as AnyRow[]), error: res.error?.message ?? null };
}

function StatCard({ label, value, detail, bad }: { label: string; value: string | number; detail?: string; bad?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${bad ? 'border-amber-500/35 bg-amber-500/10' : 'border-white/10 bg-black/45'}`}>
      <p className='text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500'>{label}</p>
      <p className={`mt-2 text-xl font-black ${bad ? 'text-amber-100' : 'text-white'}`}>{value}</p>
      {detail ? <p className='mt-1 text-xs text-zinc-400'>{detail}</p> : null}
    </div>
  );
}

function WarningCard({ title, fix }: { title: string; fix: string }) {
  return (
    <div className='rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4'>
      <p className='text-sm font-black uppercase text-amber-100'>{title}</p>
      <p className='mt-1 text-xs text-amber-50/80'>{fix}</p>
    </div>
  );
}

export default async function SystemDiagnosticsPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || session.profile?.role !== 'super_admin' || !admin) notFound();

  const nowIso = new Date().toISOString();
  const monthStart = startOfMonthIso();
  const secrets = await getStripeSecrets(admin);
  const stripeKey = secrets.secretKey ?? '';
  const stripeMode = stripeKey.startsWith('sk_live') ? 'live' : stripeKey.startsWith('sk_test') ? 'test' : 'unknown';

  let stripeAccountId = 'Unavailable';
  let balanceStatus = 'Not attempted';
  let balanceResponse = 'No Stripe secret key configured.';
  let paymentIntentStatus = 'Not attempted';
  let chargesStatus = 'Not attempted';
  let stripePaymentsFound = 0;
  let balanceTxStatus = 'Not attempted';
  let latestStripeCharge = 'None';

  if (stripeKey) {
    const stripe = new Stripe(stripeKey);
    try {
      const account = await stripe.accounts.retrieve();
      stripeAccountId = account.id;
    } catch (e) {
      stripeAccountId = `Failed: ${e instanceof Error ? e.message : String(e)}`;
    }
    try {
      const balance = await stripe.balance.retrieve();
      balanceStatus = 'OK';
      balanceResponse = prettyJson({
        available: balance.available,
        pending: balance.pending,
      });
    } catch (e) {
      balanceStatus = 'Failed';
      balanceResponse = e instanceof Error ? e.message : String(e);
    }
    try {
      const intents = await stripe.paymentIntents.list({ limit: 10 });
      paymentIntentStatus = `OK - ${intents.data.length} returned`;
      stripePaymentsFound += intents.data.length;
    } catch (e) {
      paymentIntentStatus = `Failed - ${e instanceof Error ? e.message : String(e)}`;
    }
    try {
      const charges = await stripe.charges.list({ limit: 10 });
      chargesStatus = `OK - ${charges.data.length} returned`;
      stripePaymentsFound += charges.data.length;
      latestStripeCharge = charges.data[0] ? `${charges.data[0].id} · ${displayMoney(charges.data[0].amount)} · ${charges.data[0].status}` : 'No charges returned';
    } catch (e) {
      chargesStatus = `Failed - ${e instanceof Error ? e.message : String(e)}`;
    }
    try {
      const txs = await stripe.balanceTransactions.list({ limit: 10 });
      balanceTxStatus = `OK - ${txs.data.length} returned`;
    } catch (e) {
      balanceTxStatus = `Failed - ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  const [
    payments,
    receipts,
    ledger,
    expenses,
    businessExpenses,
    mileage,
    jobMedia,
    jobPhotos,
    gallery,
    goals,
    memberships,
    customerMemberships,
    loyaltyRules,
    customerStamps,
    paymentDebug,
    apptRows,
  ] = await Promise.all([
    safeRows(admin, 'payments', '*', 10000),
    safeRows(admin, 'receipts', '*', 10000),
    safeRows(admin, 'financial_ledger', '*', 10000),
    safeRows(admin, 'expenses', '*', 10000),
    safeRows(admin, 'business_expenses', '*', 10000),
    safeRows(admin, 'job_mileage_logs', '*', 10000),
    safeRows(admin, 'job_media', '*', 10000),
    safeRows(admin, 'job_photos', '*', 10000),
    safeRows(admin, 'gallery_images', '*', 10000),
    safeRows(admin, 'business_goals', '*', 1000),
    safeRows(admin, 'membership_plans', '*', 1000),
    safeRows(admin, 'customer_memberships', '*', 1000),
    safeRows(admin, 'loyalty_rules', '*', 1000),
    safeRows(admin, 'loyalty_stamps', '*', 1000),
    safeRows(admin, 'payment_debug_events', '*', 1000),
    safeRows(admin, 'appointments', 'id, guest_name, guest_email, status', 10000),
  ]);

  const tableCounts = {
    payments: await safeCount(admin, 'payments'),
    receipts: await safeCount(admin, 'receipts'),
    financial_ledger: await safeCount(admin, 'financial_ledger'),
    expenses: await safeCount(admin, 'expenses'),
    business_expenses: await safeCount(admin, 'business_expenses'),
    job_mileage_logs: await safeCount(admin, 'job_mileage_logs'),
  };

  const apptById = new Map(apptRows.rows.map((a) => [str(a.id), { guest_name: str(a.guest_name), guest_email: str(a.guest_email) }]));
  const monthPaymentRows = await fetchPaymentsSince(admin, monthStart, nowIso);
  const revenueDiagnostics = buildRevenueDiagnostics(monthPaymentRows, { excludeTest: true, apptById, fromIso: monthStart, toIso: nowIso });

  const exclusionReasons: Record<string, number> = {};
  for (const p of [...payments.rows, ...receipts.rows]) {
    const amount = Number(p.amount_cents ?? p.final_total_cents ?? 0);
    const status = str(p.status).toLowerCase();
    const reason =
      p.is_test === true || (p.appointment_id && isTestLikeJob(apptById.get(str(p.appointment_id)) ?? {})) ? 'test' :
      isVoided(p) ? 'voided' :
      p.exclude_from_revenue === true ? 'excluded_from_revenue' :
      p.refunded_at || status === 'refunded' ? 'refunded' :
      ['canceled', 'cancelled'].includes(status) ? 'canceled' :
      !Number.isFinite(amount) || amount <= 0 ? 'missing amount' :
      !str(p.paid_at || p.created_at) ? 'missing date' :
      isOkStatus(p.status) || str(p.source_table) === 'receipts' ? '' :
      `status:${status || 'missing'}`;
    if (reason) exclusionReasons[reason] = (exclusionReasons[reason] ?? 0) + 1;
  }

  const duplicateMap = new Map<string, AnyRow[]>();
  for (const p of payments.rows) {
    const key = paymentDuplicateKey(p);
    if (!key || key.includes('||')) continue;
    const list = duplicateMap.get(key) ?? [];
    list.push(p);
    duplicateMap.set(key, list);
  }
  const duplicateGroups = Array.from(duplicateMap.entries()).filter(([, rows]) => rows.length > 1);
  const duplicateStripeTransactions = duplicateGroups.filter(([key]) => key.startsWith('stripe:')).length;
  const stripePaymentsWritten = payments.rows.filter((p) => str(p.stripe_payment_intent_id) || str(p.stripe_checkout_session_id) || str(p.payment_method).toLowerCase().includes('stripe')).length;

  const allPhotos = [...jobMedia.rows, ...jobPhotos.rows];
  const photosMissingUrl = allPhotos.filter((p) => !str(p.url || p.public_url || p.media_url || p.file_url || p.storage_path || p.path));
  const photosMissingVehicleIndex = allPhotos.filter((p) => p.vehicle_index == null && !str(p.vehicle_label || p.vehicle_description));
  const workOrdersWithPhotos = new Set(allPhotos.map((p) => str(p.appointment_id || p.fallback_booking_id || p.work_order_id)).filter(Boolean)).size;
  const featuredGallery = gallery.rows.filter((g) => g.featured === true);
  const publishedHomepage = gallery.rows.filter((g) => g.featured === true && (g.published !== false && g.active !== false));
  const activeGoals = goals.rows.filter((g) => g.active !== false && g.archived !== true);
  const techGoals = goals.rows.filter((g) => str(g.scope || g.goal_type || g.goal_key).toLowerCase().includes('tech'));
  const activeMemberships = customerMemberships.rows.filter((m) => ['active', 'trialing'].includes(str(m.status).toLowerCase()));
  const latestDebug = paymentDebug.rows.sort((a, b) => str(b.created_at).localeCompare(str(a.created_at)))[0];

  const warnings: Array<{ title: string; fix: string }> = [];
  if (!secrets.secretKey) warnings.push({ title: 'Missing Stripe secret', fix: 'Add STRIPE_SECRET_KEY in Vercel Production env or save it in Admin → Stripe settings.' });
  if (!secrets.webhookSecret) warnings.push({ title: 'Missing webhook secret', fix: 'Add STRIPE_WEBHOOK_SECRET and configure Stripe webhook to /api/stripe/webhook.' });
  if (paymentDebug.rows.length === 0) warnings.push({ title: 'No Stripe webhook/debug events found', fix: 'Trigger a live checkout or inspect Stripe webhook delivery logs. This app has no recent payment_debug_events rows.' });
  if (stripeMode === 'test') warnings.push({ title: 'Stripe key is test mode', fix: 'Production dashboard values require sk_live... STRIPE_SECRET_KEY. Test keys cannot read live balances.' });
  if (duplicateGroups.length > 0 || revenueDiagnostics.duplicateExtraCount > 0) warnings.push({ title: 'Duplicate payments detected', fix: 'Open Revenue or Payments, compare duplicate groups, then exclude duplicate rows from revenue instead of deleting real records.' });
  if (expenses.rows.length + businessExpenses.rows.length + mileage.rows.length > 0 && revenueDiagnostics.grossCents === 0) warnings.push({ title: 'Expenses exist while revenue is zero', fix: 'Check date filters, excluded/test flags, and payment status. Expenses still subtract from net profit once revenue rows are counted.' });
  if (allPhotos.length > 0 && photosMissingUrl.length > 0) warnings.push({ title: 'Work-order photos missing URLs', fix: 'Repair job_media/job_photos rows with public_url/media_url/file_url/storage_path so CMS can display them.' });
  if (featuredGallery.length > 0 && publishedHomepage.length === 0) warnings.push({ title: 'Featured gallery rows not visible on homepage', fix: 'Mark featured rows as published/active or republish through Website & Gallery → Before/After Publisher.' });

  return (
    <DashboardShell title='System diagnostics' subtitle='Root-cause audit for Stripe, revenue, gallery, goals, loyalty, and production data health.' role='super_admin'>
      {warnings.length > 0 ? (
        <section className='grid gap-3 lg:grid-cols-2'>
          {warnings.map((w) => <WarningCard key={w.title} title={w.title} fix={w.fix} />)}
        </section>
      ) : (
        <div className='rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100'>No critical diagnostics warnings detected in this snapshot.</div>
      )}

      <section className='rounded-3xl border border-gold/20 bg-zinc-950/80 p-5'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Stripe diagnostics</p>
            <p className='mt-1 text-xs text-zinc-500'>Runtime secret source: {secrets.source} · mode: {stripeMode}</p>
          </div>
          <Link href='/admin/stripe-sync' className='rounded-xl border border-gold/40 px-4 py-2 text-xs font-black uppercase text-gold-soft'>Open Stripe sync</Link>
        </div>
        <div className='mt-4 grid gap-3 md:grid-cols-3'>
          <StatCard label='STRIPE_SECRET_KEY exists' value={yesNo(Boolean(secrets.secretKey))} bad={!secrets.secretKey} />
          <StatCard label='STRIPE_WEBHOOK_SECRET exists' value={yesNo(Boolean(secrets.webhookSecret))} bad={!secrets.webhookSecret} />
          <StatCard label='Stripe account id' value={stripeAccountId} />
          <StatCard label='Balance API status' value={balanceStatus} detail={balanceResponse} bad={balanceStatus === 'Failed'} />
          <StatCard label='Payment intents list' value={paymentIntentStatus} bad={paymentIntentStatus.startsWith('Failed')} />
          <StatCard label='Charges list' value={chargesStatus} detail={latestStripeCharge} bad={chargesStatus.startsWith('Failed')} />
          <StatCard label='Balance transactions list' value={balanceTxStatus} bad={balanceTxStatus.startsWith('Failed')} />
          <StatCard label='Stripe payments found via API' value={stripePaymentsFound} />
          <StatCard label='Stripe payments written to DB' value={stripePaymentsWritten} />
          <StatCard label='Duplicate Stripe transaction groups' value={duplicateStripeTransactions} bad={duplicateStripeTransactions > 0} />
          <StatCard label='Latest webhook/debug event' value={str(latestDebug?.event_type) || 'None'} detail={str(latestDebug?.created_at || latestDebug?.error_message)} bad={!latestDebug} />
          <StatCard label='Last sync time / error' value={str(ledger.rows.find((r) => str(r.category) === 'sync_marker')?.created_at) || 'No sync marker'} detail={str(latestDebug?.error_message) || 'No latest error row'} />
        </div>
      </section>

      <section className='rounded-3xl border border-gold/20 bg-zinc-950/80 p-5'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Finance diagnostics</p>
        <div className='mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6'>
          {Object.entries(tableCounts).map(([key, value]) => <StatCard key={key} label={key} value={value.count} detail={value.error ?? undefined} bad={Boolean(value.error)} />)}
          <StatCard label='Rows included this month' value={revenueDiagnostics.rowsCounted} />
          <StatCard label='Rows excluded this month' value={revenueDiagnostics.rowsExcluded} bad={revenueDiagnostics.rowsExcluded > 0} />
          <StatCard label='Gross counted this month' value={displayMoney(revenueDiagnostics.grossCents)} />
          <StatCard label='Duplicate payment groups' value={duplicateGroups.length} bad={duplicateGroups.length > 0} />
          <StatCard label='Duplicate rows auto-excluded' value={revenueDiagnostics.duplicateExtraCount} bad={revenueDiagnostics.duplicateExtraCount > 0} />
        </div>
        <div className='mt-5 grid gap-4 lg:grid-cols-2'>
          <div className='rounded-2xl border border-white/10 bg-black/35 p-4'>
            <p className='text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500'>Payment method breakdown</p>
            <ul className='mt-3 grid gap-2 sm:grid-cols-2'>
              {['cash', 'stripe', 'zelle', 'venmo', 'cash_app', 'manual_card', 'check', 'other'].map((key) => (
                <li key={key} className='flex justify-between rounded-xl border border-white/10 px-3 py-2 text-xs'>
                  <span className='text-zinc-300'>{key.replace(/_/g, ' ')}</span>
                  <span className='font-mono text-gold-soft'>{displayMoney(revenueDiagnostics.byMethod[key] ?? 0)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className='rounded-2xl border border-white/10 bg-black/35 p-4'>
            <p className='text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500'>Excluded reason counts</p>
            <ul className='mt-3 space-y-2'>
              {Object.entries(exclusionReasons).map(([reason, count]) => (
                <li key={reason} className='flex justify-between rounded-xl border border-white/10 px-3 py-2 text-xs'>
                  <span className='text-zinc-300'>{reason}</span>
                  <span className='font-mono text-amber-200'>{count}</span>
                </li>
              ))}
              {Object.keys(exclusionReasons).length === 0 ? <li className='text-xs text-zinc-500'>No excluded rows detected in full payment/receipt scan.</li> : null}
            </ul>
          </div>
        </div>
      </section>

      <section className='grid gap-5 lg:grid-cols-2'>
        <div className='rounded-3xl border border-gold/20 bg-zinc-950/80 p-5'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Gallery diagnostics</p>
          <div className='mt-4 grid gap-3 sm:grid-cols-2'>
            <StatCard label='job_media count' value={jobMedia.rows.length} detail={jobMedia.error ?? undefined} bad={Boolean(jobMedia.error)} />
            <StatCard label='job_photos count' value={jobPhotos.rows.length} detail={jobPhotos.error ?? undefined} bad={Boolean(jobPhotos.error)} />
            <StatCard label='Work orders with photos' value={workOrdersWithPhotos} />
            <StatCard label='Photos missing vehicle index/label' value={photosMissingVehicleIndex.length} bad={photosMissingVehicleIndex.length > 0} />
            <StatCard label='Photos missing URL/path' value={photosMissingUrl.length} bad={photosMissingUrl.length > 0} />
            <StatCard label='gallery_images count' value={gallery.rows.length} detail={gallery.error ?? undefined} bad={Boolean(gallery.error)} />
            <StatCard label='Featured gallery count' value={featuredGallery.length} />
            <StatCard label='Published homepage count' value={publishedHomepage.length} bad={featuredGallery.length > 0 && publishedHomepage.length === 0} />
          </div>
        </div>

        <div className='rounded-3xl border border-gold/20 bg-zinc-950/80 p-5'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Goals / loyalty diagnostics</p>
          <div className='mt-4 grid gap-3 sm:grid-cols-2'>
            <StatCard label='Goals count' value={goals.rows.length} detail={goals.error ?? undefined} bad={Boolean(goals.error)} />
            <StatCard label='Active goals count' value={activeGoals.length} />
            <StatCard label='Technician goals count' value={techGoals.length} />
            <StatCard label='Loyalty rules count' value={loyaltyRules.rows.length} detail={loyaltyRules.error ?? undefined} bad={Boolean(loyaltyRules.error)} />
            <StatCard label='Customer stamp rows' value={customerStamps.rows.length} detail={customerStamps.error ?? undefined} bad={Boolean(customerStamps.error)} />
            <StatCard label='Membership plans count' value={memberships.rows.length} detail={memberships.error ?? undefined} bad={Boolean(memberships.error)} />
            <StatCard label='Active memberships count' value={activeMemberships.length} detail={customerMemberships.error ?? undefined} bad={Boolean(customerMemberships.error)} />
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}
