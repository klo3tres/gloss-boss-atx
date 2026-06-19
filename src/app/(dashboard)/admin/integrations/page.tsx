import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { IntegrationResendTestForm, IntegrationTwilioTestForm } from '@/components/admin/integration-test-forms';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resendDomainVerified, resendDomainWarning, resendFromEmail } from '@/lib/resend-config';
import { twilioMessagingServiceSid, twilioFromNumber, twilioSenderReady } from '@/lib/twilio-config';
import { RESEND_WEBHOOK_EVENTS, RESEND_WEBHOOK_PATH } from '@/lib/resend-webhook';
import { inboundForwardTo, inboundMailboxAddress } from '@/lib/email/inbound-email';
import {
  APPLE_ADVANCED_API_MESSAGE,
  appleAdvancedApiStatus,
  businessHomeBaseConfigured,
  googleMapsConfigured,
  openWeatherConfigured,
} from '@/lib/weather-config';

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
    <section className='rounded-3xl border border-white/5 bg-zinc-950/45 p-6 shadow-xl relative overflow-hidden group hover:border-gold/20 transition-all duration-300'>
      <div className='flex items-start justify-between gap-4'>
        <div>
          <p className='text-xs font-black uppercase tracking-[0.22em] text-zinc-400 group-hover:text-gold-soft transition'>{name}</p>
          <p className={`mt-2 text-lg font-black ${ok ? 'text-emerald-400' : 'text-amber-300'}`}>{ok ? 'Connected' : 'Missing setup'}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider border ${ok ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25' : 'bg-amber-500/10 text-amber-300 border-amber-500/25'}`}>{ok ? 'OK' : 'Action Required'}</span>
      </div>
      {alert ? (
        <p className='mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200/90 leading-relaxed'>{alert}</p>
      ) : null}
      
      {/* Collapsed key checklists */}
      <details className='mt-4 pt-3 border-t border-white/5 text-xs group'>
        <summary className='cursor-pointer text-[9px] font-black uppercase tracking-wider text-zinc-500 hover:text-gold-soft transition flex items-center justify-between select-none'>
          <span>Credentials Checklist</span>
          <span className='rounded-md border border-white/10 px-2 py-0.5 text-[8px] bg-zinc-950/40 group-open:bg-zinc-900 transition'>Toggle Details</span>
        </summary>
        <div className='mt-3 space-y-2 pt-2'>
          {vars.map(([key, present]) => (
            <div key={key} className='flex items-center justify-between rounded-xl border border-white/5 bg-black/45 px-3 py-2 text-xs'>
              <span className='text-zinc-400 font-mono text-[10px]'>{key}</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${present ? 'text-emerald-400' : 'text-red-400'}`}>{present ? 'Verified' : 'Missing'}</span>
            </div>
          ))}
        </div>
      </details>

      {last ? (
        <p className='mt-3 text-[10px] text-zinc-500 font-mono'>
          Last audit event: {String(last.status)} · {chicago(last.created_at)} {last.error_message ? `· ${String(last.error_message)}` : ''}
        </p>
      ) : null}
      {children ? <div className='mt-4 pt-3 border-t border-white/5'>{children}</div> : null}
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
  const appleAdvanced = appleAdvancedApiStatus();

  return (
    <DashboardShell 
      title='System & API Integrations' 
      subtitle='Real-time connection status monitoring, environment credentials audit, and communication webhooks.' 
      role='admin'
    >
      <div className='mb-6 rounded-3xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-black to-zinc-950 p-5 shadow-lg relative overflow-hidden group hover:border-amber-500/30 transition-all duration-300'>
        <p className='text-xs font-black uppercase tracking-[0.25em] text-amber-300'>Toll-Free Verification Warning</p>
        <p className='mt-2 text-xs text-zinc-400 leading-relaxed'>
          Outbound SMS routes may fail with carrier error code <span className='font-mono text-amber-200'>30032</span> until Twilio toll-free verification is completed. 
          Standard email dispatch via Resend will continue functioning correctly. Monitor status updates under Twilio Console → Toll-Free Verification.
        </p>
      </div>

      {resendWarn ? (
        <p className='mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100'>{resendWarn}</p>
      ) : null}

      <div className='border-b border-white/10 pb-3 mb-5 flex items-center justify-between'>
        <p className='text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>Active Infrastructure Nodes</p>
        <span className='text-[10px] text-zinc-500 font-mono'>Updated real-time</span>
      </div>

      <section className='grid gap-6 lg:grid-cols-2'>
        <Card
          name='Resend Outbound Email'
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
          <div className='space-y-4'>
            {fromEmail ? <p className='font-mono text-xs text-zinc-400'>RESEND_FROM_EMAIL={fromEmail}</p> : null}
            <IntegrationResendTestForm />
          </div>
        </Card>

        <Card
          name='Twilio Gateway SMS'
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
          <div className='space-y-4'>
            {twilioMessagingServiceSid() ? (
              <p className='font-mono text-xs text-zinc-400 break-all'>Messaging Service SID: {twilioMessagingServiceSid()}</p>
            ) : twilioFromNumber() ? (
              <p className='font-mono text-xs text-zinc-400'>From number: {twilioFromNumber()}</p>
            ) : null}
            <IntegrationTwilioTestForm lastSid={String(last('twilio_test')?.provider_message_id ?? '') || null} />
          </div>
        </Card>

        <Card 
          name='Stripe Financial Ledger' 
          ok={Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_LIVE)} 
          vars={[
            ['STRIPE_SECRET_KEY / LIVE', Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_LIVE)], 
            ['STRIPE_WEBHOOK_SECRET', Boolean(process.env.STRIPE_WEBHOOK_SECRET)], 
            ['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)]
          ]} 
        />

        <Card 
          name='Supabase Database Engine' 
          ok={Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY)} 
          vars={[
            ['NEXT_PUBLIC_SUPABASE_URL', Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)], 
            ['NEXT_PUBLIC_SUPABASE_ANON_KEY', Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)], 
            ['SUPABASE_SERVICE_ROLE_KEY', Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)]
          ]} 
        />

        <Card 
          name='Vercel DNS Domain Routing' 
          ok={Boolean(appUrl && !appUrl.includes('localhost'))} 
          vars={[
            ['NEXT_PUBLIC_APP_URL', Boolean(appUrl)], 
            ['No localhost in production URL', Boolean(appUrl && !appUrl.includes('localhost'))], 
            ['Current URL', Boolean(appUrl)]
          ]} 
        />

        <Card 
          name='Vercel System Analytics' 
          ok={Boolean(process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ANALYTICS_ID)} 
          vars={[
            ['VERCEL', Boolean(process.env.VERCEL)], 
            ['NEXT_PUBLIC_VERCEL_ANALYTICS_ID', Boolean(process.env.NEXT_PUBLIC_VERCEL_ANALYTICS_ID)]
          ]} 
        />

        <Card
          name='OpenWeather Forecasts'
          ok={openWeatherConfigured()}
          vars={[
            ['OPENWEATHER_API_KEY', Boolean(process.env.OPENWEATHER_API_KEY)],
            ['BUSINESS_HOME_BASE_ADDRESS', businessHomeBaseConfigured()],
            ['BUSINESS_LAT', Boolean(process.env.BUSINESS_LAT)],
            ['BUSINESS_LNG', Boolean(process.env.BUSINESS_LNG)],
            ['GOOGLE_MAPS_API_KEY / MAPS_API_KEY', googleMapsConfigured()],
          ]}
          alert={
            openWeatherConfigured()
              ? 'Weather widgets use OpenWeather first. BUSINESS_HOME_BASE_ADDRESS is the fallback service-area lookup; BUSINESS_LAT and BUSINESS_LNG bypass geocoding when set.'
              : 'missing OPENWEATHER_API_KEY'
          }
        >
          <p className='text-xs leading-relaxed text-zinc-400'>
            Apple WeatherKit is future/advanced and is not required for current weather widgets.
          </p>
        </Card>

        <Card
          name='Apple Maps/Weather Advanced APIs'
          ok={appleAdvanced.configured}
          vars={[
            ['APPLE_TEAM_ID', Boolean(process.env.APPLE_TEAM_ID)],
            ['APPLE_KEY_ID', Boolean(process.env.APPLE_KEY_ID)],
            ['APPLE_SERVICE_ID', Boolean(process.env.APPLE_SERVICE_ID)],
            ['APPLE_PRIVATE_KEY', Boolean(process.env.APPLE_PRIVATE_KEY)],
            ['APPLE_MAPS_KEY_ID', Boolean(process.env.APPLE_MAPS_KEY_ID)],
            ['APPLE_MAPS_PRIVATE_KEY', Boolean(process.env.APPLE_MAPS_PRIVATE_KEY)],
          ]}
          alert={appleAdvanced.configured ? null : APPLE_ADVANCED_API_MESSAGE}
        >
          <p className='text-xs leading-relaxed text-zinc-400'>
            Navigation uses basic Apple Maps and Google Maps direction links now, so no Apple Developer token is required yet.
          </p>
        </Card>

        <Card
          name='Resend Inbound Webhook'
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
          <div className='space-y-3'>
            {webhookUrl ? (
              <p className='break-all font-mono text-xs text-gold-soft bg-zinc-950 p-2.5 rounded-lg border border-white/5'>{webhookUrl}</p>
            ) : null}
            <div className='grid gap-2 text-xs text-zinc-400 bg-black/30 border border-white/5 p-4 rounded-xl'>
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
                <div className='mt-2 space-y-1.5 pt-2 border-t border-white/5'>
                  <p>
                    <span className='font-bold text-zinc-300'>Sender:</span> {inboundFrom}
                  </p>
                  <p>
                    <span className='font-bold text-zinc-300'>Webhook status:</span> {inboundStatus}
                    {lastInboundWebhook.error_message ? ` · ${String(lastInboundWebhook.error_message)}` : ''}
                  </p>
                  {inboundPayload ? (
                    <details className='mt-2 text-xs group'>
                      <summary className='cursor-pointer text-[10px] font-black uppercase tracking-wider text-zinc-500 hover:text-gold-soft select-none flex items-center justify-between'>
                        <span>Toggle Webhook Payload</span>
                      </summary>
                      <pre className='mt-2 break-all font-mono text-[10px] text-zinc-500 bg-black/60 p-2.5 rounded-lg max-h-24 overflow-y-auto leading-relaxed border border-white/5'>
                        {JSON.stringify(inboundPayload, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              ) : null}
              <p className='pt-2 mt-2 border-t border-white/5'>
                <span className='font-bold text-zinc-300'>Last send test (manual):</span>{' '}
                {last('resend_test') ? `${String(last('resend_test')!.status)} · ${chicago(last('resend_test')!.created_at)}` : 'None yet'}
              </p>
            </div>
          </div>
        </Card>
      </section>
    </DashboardShell>
  );
}
