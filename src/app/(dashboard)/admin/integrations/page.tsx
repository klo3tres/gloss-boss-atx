import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { IntegrationResendTestForm, IntegrationTwilioTestForm } from '@/components/admin/integration-test-forms';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resendDomainVerified, resendDomainWarning, resendFromEmail } from '@/lib/resend-config';
import { twilioMessagingServiceSid, twilioFromNumber, twilioSenderReady } from '@/lib/twilio-config';
import { RESEND_WEBHOOK_EVENTS, RESEND_WEBHOOK_PATH } from '@/lib/resend-webhook';
import { inboundForwardTo, inboundMailboxAddress } from '@/lib/email/inbound-email';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

function configured(...values: Array<string | undefined>) {
  return values.every((v) => Boolean(v?.trim()));
}

function chicago(v: unknown) {
  if (!v) return 'Never';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(String(v)));
}

function Card({
  name,
  ok,
  vars,
  children,
  last,
  alert,
}: {
  name: string;
  ok: boolean;
  vars: Array<[string, boolean]>;
  children?: React.ReactNode;
  last?: Row;
  alert?: string | null;
}) {
  return (
    <section className='rounded-3xl border border-gold/20 bg-zinc-950/90 p-5 shadow-[0_0_28px_rgba(212,166,77,0.08)]'>
      <div className='flex items-start justify-between gap-4'>
        <div>
          <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>{name}</p>
          <p className={`mt-2 text-lg font-black ${ok ? 'text-emerald-300' : 'text-amber-200'}`}>{ok ? 'Connected' : 'Missing setup'}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${ok ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-200'}`}>{ok ? 'OK' : 'Action'}</span>
      </div>
      {alert ? (
        <p className='mt-4 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-100'>{alert}</p>
      ) : null}
      <div className='mt-4 space-y-2'>
        {vars.map(([key, present]) => (
          <div key={key} className='flex items-center justify-between rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs'>
            <span className='text-zinc-300'>{key}</span>
            <span className={present ? 'text-emerald-300' : 'text-red-300'}>{present ? 'configured' : 'missing'}</span>
          </div>
        ))}
      </div>
      {last ? (
        <p className='mt-3 text-xs text-zinc-500'>
          Last test: {String(last.status)} · {chicago(last.created_at)} {last.error_message ? `· ${String(last.error_message)}` : ''}
        </p>
      ) : null}
      {children ? <div className='mt-4'>{children}</div> : null}
    </section>
  );
}

export default async function AdminIntegrationsPage() {
  const admin = tryCreateAdminSupabase();
  const tests = admin ? (((await admin.from('integration_test_events').select('*').order('created_at', { ascending: false }).limit(20)).data ?? []) as Row[]) : [];
  const last = (kind: string) => tests.find((t) => String(t.kind) === kind);
  const lastInboundWebhook = tests.find((t) => String(t.kind) === 'resend_inbound_received');
  const lastOutboundWebhook = tests.find((t) => String(t.kind) === 'resend_webhook_outbound');
  const inboundPayload =
    lastInboundWebhook?.payload && typeof lastInboundWebhook.payload === 'object'
      ? (lastInboundWebhook.payload as Record<string, unknown>)
      : null;
  const inboundFrom = String(lastInboundWebhook?.destination ?? inboundPayload?.from ?? '—');
  const inboundStatus = String(lastInboundWebhook?.status ?? '—');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, '') ?? '';
  const webhookUrl = appUrl && !appUrl.includes('localhost') ? `${appUrl}${RESEND_WEBHOOK_PATH}` : '';
  const fromEmail = resendFromEmail();
  const domainOk = resendDomainVerified();
  const resendWarn = resendDomainWarning();

  return (
    <DashboardShell title='Integrations' subtitle='Connection status and safe send tests for customer communications and production infrastructure.' role='admin'>
      {resendWarn ? (
        <p className='mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100'>{resendWarn}</p>
      ) : null}
      <section className='grid gap-4 lg:grid-cols-2'>
        <Card
          name='Resend'
          ok={configured(process.env.RESEND_API_KEY, process.env.RESEND_FROM_EMAIL) && domainOk}
          vars={[
            ['RESEND_API_KEY', Boolean(process.env.RESEND_API_KEY)],
            ['RESEND_FROM_EMAIL', Boolean(fromEmail)],
            ['From email value', Boolean(fromEmail)],
            ['glossbossatx.com domain verified', domainOk],
          ]}
          last={last('resend_test')}
          alert={resendWarn}
        >
          {fromEmail ? <p className='mb-3 font-mono text-xs text-zinc-400'>RESEND_FROM_EMAIL={fromEmail}</p> : null}
          <IntegrationResendTestForm />
        </Card>
        <Card
          name='Twilio'
          ok={twilioSenderReady()}
          vars={[
            ['TWILIO_ACCOUNT_SID', Boolean(process.env.TWILIO_ACCOUNT_SID)],
            ['TWILIO_AUTH_TOKEN', Boolean(process.env.TWILIO_AUTH_TOKEN)],
            ['TWILIO_MESSAGING_SERVICE_SID (preferred)', Boolean(twilioMessagingServiceSid())],
            ['TWILIO_FROM_NUMBER (fallback)', Boolean(twilioFromNumber())],
          ]}
          last={last('twilio_test')}
          alert={
            twilioMessagingServiceSid()
              ? 'Using Messaging Service SID for outbound SMS (recommended). If you see error 30032, complete Twilio Toll-Free Verification for +18664853974. Customer emails still send when Resend is configured.'
              : twilioFromNumber()
                ? 'Using direct From number. Add TWILIO_MESSAGING_SERVICE_SID if sends fail. Toll-free numbers require carrier verification (Twilio error 30032 until verified).'
                : null
          }
        >
          {twilioMessagingServiceSid() ? (
            <p className='mb-3 font-mono text-xs text-zinc-400 break-all'>Messaging Service SID: {twilioMessagingServiceSid()}</p>
          ) : twilioFromNumber() ? (
            <p className='mb-3 font-mono text-xs text-zinc-400'>From number: {twilioFromNumber()}</p>
          ) : null}
          <IntegrationTwilioTestForm lastSid={String(last('twilio_test')?.provider_message_id ?? '') || null} />
        </Card>
        <Card name='Stripe' ok={Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_LIVE)} vars={[['STRIPE_SECRET_KEY / LIVE', Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_LIVE)], ['STRIPE_WEBHOOK_SECRET', Boolean(process.env.STRIPE_WEBHOOK_SECRET)], ['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)]]} />
        <Card name='Supabase' ok={Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY)} vars={[['NEXT_PUBLIC_SUPABASE_URL', Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)], ['NEXT_PUBLIC_SUPABASE_ANON_KEY', Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)], ['SUPABASE_SERVICE_ROLE_KEY', Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)]]} />
        <Card name='Vercel Domain' ok={Boolean(appUrl && !appUrl.includes('localhost'))} vars={[['NEXT_PUBLIC_APP_URL', Boolean(appUrl)], ['No localhost in production URL', Boolean(appUrl && !appUrl.includes('localhost'))], ['Current URL', Boolean(appUrl)]]} />
        <Card name='Vercel Analytics' ok={Boolean(process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ANALYTICS_ID)} vars={[['VERCEL', Boolean(process.env.VERCEL)], ['NEXT_PUBLIC_VERCEL_ANALYTICS_ID', Boolean(process.env.NEXT_PUBLIC_VERCEL_ANALYTICS_ID)]]} />
        <Card
          name='Resend webhook'
          ok={Boolean(process.env.RESEND_API_KEY && process.env.RESEND_WEBHOOK_SECRET && webhookUrl)}
          vars={[
            ['RESEND_API_KEY', Boolean(process.env.RESEND_API_KEY)],
            ['RESEND_WEBHOOK_SECRET', Boolean(process.env.RESEND_WEBHOOK_SECRET)],
            ['INBOUND_MAILBOX_EMAIL', Boolean(process.env.INBOUND_MAILBOX_EMAIL || inboundMailboxAddress())],
            ['INBOUND_FORWARD_TO', Boolean(process.env.INBOUND_FORWARD_TO || process.env.CONTACT_NOTIFY_EMAIL)],
          ]}
          last={lastOutboundWebhook ?? lastInboundWebhook}
          alert={
            webhookUrl
              ? `Configure ONE webhook in Resend: ${webhookUrl} — Events: ${RESEND_WEBHOOK_EVENTS.join(', ')}. Inbound ${inboundMailboxAddress()} → CRM + ${inboundForwardTo()}. Do not use /api/webhooks/resend-inbound.`
              : 'Set NEXT_PUBLIC_APP_URL (production, not localhost) to show the webhook URL.'
          }
        >
          {webhookUrl ? (
            <p className='mb-3 break-all font-mono text-xs text-gold-soft'>{webhookUrl}</p>
          ) : null}
          <div className='grid gap-2 text-xs text-zinc-400'>
            <p>
              <span className='font-bold text-zinc-300'>Last outbound webhook:</span>{' '}
              {lastOutboundWebhook
                ? `${String(lastOutboundWebhook.event_type ?? lastOutboundWebhook.status)} · ${chicago(lastOutboundWebhook.created_at)}`
                : 'None yet'}
            </p>
            <p>
              <span className='font-bold text-zinc-300'>Last inbound email:</span>{' '}
              {lastInboundWebhook ? chicago(lastInboundWebhook.created_at) : 'None yet'}
            </p>
            {lastInboundWebhook ? (
              <>
                <p>
                  <span className='font-bold text-zinc-300'>Sender:</span> {inboundFrom}
                </p>
                <p>
                  <span className='font-bold text-zinc-300'>Webhook status:</span> {inboundStatus}
                  {lastInboundWebhook.error_message ? ` · ${String(lastInboundWebhook.error_message)}` : ''}
                </p>
                {inboundPayload ? (
                  <p className='break-all font-mono text-[10px] text-zinc-500'>
                    payload: {JSON.stringify(inboundPayload).slice(0, 280)}
                    {JSON.stringify(inboundPayload).length > 280 ? '…' : ''}
                  </p>
                ) : null}
              </>
            ) : null}
            <p>
              <span className='font-bold text-zinc-300'>Last send test (manual):</span>{' '}
              {last('resend_test') ? `${String(last('resend_test')!.status)} · ${chicago(last('resend_test')!.created_at)}` : 'None yet'}
            </p>
          </div>
        </Card>
      </section>
    </DashboardShell>
  );
}
