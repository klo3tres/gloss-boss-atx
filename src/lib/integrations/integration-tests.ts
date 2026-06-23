import { getStripeSdk } from '@/lib/stripe/stripeService';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { fetchWeatherForAddress } from '@/lib/weather-forecast';
import { resendConfigured, sendResendHtml, twilioConfigured } from '@/lib/email-send';
import { sendCustomerSms } from '@/lib/sms-send';
import { normalizeToE164 } from '@/lib/us-phone';
import {
  probeAppleMapKitStatic,
  probeGoogleMapsGeocode,
  probeGooglePlacesSearch,
  type IntegrationConnectionStatus,
} from '@/lib/integrations/maps-discovery-status';

export type IntegrationTestKind =
  | 'google_places'
  | 'google_maps'
  | 'apple_mapkit'
  | 'openweather'
  | 'twilio'
  | 'resend'
  | 'stripe';

export type IntegrationTestResult = {
  ok: boolean;
  status: IntegrationConnectionStatus;
  detail: string;
};

export async function runIntegrationProbe(kind: IntegrationTestKind): Promise<IntegrationTestResult> {
  switch (kind) {
    case 'google_places': {
      const r = await probeGooglePlacesSearch();
      return { ok: r.status === 'connected', status: r.status, detail: r.detail };
    }
    case 'google_maps': {
      const r = await probeGoogleMapsGeocode();
      return { ok: r.status === 'connected', status: r.status, detail: r.detail };
    }
    case 'apple_mapkit': {
      const r = probeAppleMapKitStatic();
      return { ok: r.status === 'connected', status: r.status, detail: r.detail };
    }
    case 'openweather': {
      if (!process.env.OPENWEATHER_API_KEY?.trim() && !process.env.OPENWEATHER_API_KE?.trim()) {
        return { ok: false, status: 'missing', detail: 'OPENWEATHER_API_KEY not set.' };
      }
      const snap = await fetchWeatherForAddress(process.env.BUSINESS_HOME_BASE_ADDRESS?.trim() || 'Austin, TX');
      if (snap.ok) {
        return {
          ok: true,
          status: 'connected',
          detail: `OpenWeather OK — ${snap.temperatureF ?? '?'}°F, ${snap.description ?? snap.condition ?? 'forecast loaded'}.`,
        };
      }
      return { ok: false, status: 'invalid_key', detail: snap.blocker ?? 'OpenWeather request failed.' };
    }
    case 'stripe': {
      const admin = tryCreateAdminSupabase();
      const stripe = await getStripeSdk(admin);
      if (!stripe) return { ok: false, status: 'missing', detail: 'Stripe secret key not configured.' };
      try {
        const balance = await stripe.balance.retrieve();
        const available = balance.available?.[0];
        return {
          ok: true,
          status: 'connected',
          detail: `Stripe connected — ${available?.currency?.toUpperCase() ?? 'USD'} balance readable.`,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const status: IntegrationConnectionStatus = /invalid|authentication/i.test(msg) ? 'invalid_key' : 'api_not_enabled';
        return { ok: false, status, detail: msg.slice(0, 200) };
      }
    }
    case 'twilio': {
      if (!twilioConfigured()) {
        return { ok: false, status: 'missing', detail: 'Twilio credentials missing.' };
      }
      return { ok: true, status: 'connected', detail: 'Twilio credentials present — use Send Test SMS for delivery check.' };
    }
    case 'resend': {
      if (!resendConfigured()) {
        return { ok: false, status: 'missing', detail: 'Resend API key or from email missing.' };
      }
      return { ok: true, status: 'connected', detail: 'Resend configured — use Send Test Email for delivery check.' };
    }
    default:
      return { ok: false, status: 'missing', detail: 'Unknown integration test.' };
  }
}

export async function runTwilioIntegrationTest(toRaw: string, userId: string) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return { ok: false, status: 'missing' as const, detail: 'Database unavailable.' };
  if (!twilioConfigured()) return { ok: false, status: 'missing' as const, detail: 'Twilio not configured.' };
  const phone = normalizeToE164(toRaw);
  if (!phone.ok) return { ok: false, status: 'invalid_key' as const, detail: phone.error };

  const sent = await sendCustomerSms({
    db: admin,
    kind: 'twilio_test',
    to: phone.e164,
    body: 'Gloss Boss ATX integration test — Twilio connected.',
    extraPayload: { integration_test: true },
  });

  await admin.from('integration_test_events').insert({
    kind: 'twilio_test',
    status: sent.ok ? 'sent' : 'failed',
    destination: phone.e164,
    error_message: sent.error ?? sent.deliveryStatus ?? null,
    actor_id: userId,
    provider_message_id: sent.sid ?? null,
    created_at: new Date().toISOString(),
  });

  return {
    ok: sent.ok,
    status: (sent.ok ? 'connected' : 'invalid_key') as IntegrationConnectionStatus,
    detail: sent.ok ? `SMS accepted by Twilio (SID ${sent.sid ?? 'n/a'}).` : (sent.error ?? 'Twilio send failed.'),
  };
}

export async function runResendIntegrationTest(to: string, userId: string) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return { ok: false, status: 'missing' as const, detail: 'Database unavailable.' };
  if (!resendConfigured()) return { ok: false, status: 'missing' as const, detail: 'Resend not configured.' };

  const sent = await sendResendHtml({
    to,
    subject: 'Gloss Boss ATX integration test',
    html: '<p>Resend integration test from Titan Growth OS.</p>',
  });

  await admin.from('integration_test_events').insert({
    kind: 'resend_test',
    status: sent.ok ? 'sent' : 'failed',
    destination: to,
    error_message: sent.error ?? null,
    actor_id: userId,
    provider_message_id: sent.emailId ?? null,
    created_at: new Date().toISOString(),
  });

  return {
    ok: sent.ok,
    status: (sent.ok ? 'connected' : 'invalid_key') as IntegrationConnectionStatus,
    detail: sent.ok ? `Email queued (ID ${sent.emailId ?? 'n/a'}).` : (sent.error ?? 'Resend send failed.'),
  };
}
