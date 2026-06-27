import { twilioAccountSid, twilioCredentialsPresent, twilioSenderReady } from '@/lib/twilio-config';
import { resendConfigured } from '@/lib/email-send';
import { placesDiscoveryConfigured, googleMapsRenderConfigured, appleMapKitCredentialsPresent } from '@/lib/integrations/maps-discovery-status';
import { googleCalendarOAuthConfigured } from '@/lib/google/google-calendar-config';

export type IntegrationStatusLevel = 'missing' | 'trial' | 'ready' | 'optional';

export type IntegrationStatusRow = {
  id: string;
  label: string;
  level: IntegrationStatusLevel;
  detail: string;
};

export function buildIntegrationStatusRows(): IntegrationStatusRow[] {
  const twilioCreds = twilioCredentialsPresent();
  const twilioReady = twilioSenderReady();
  const twilioTrial = twilioCreds && process.env.TWILIO_ACCOUNT_SID?.startsWith('AC') && !process.env.TWILIO_MESSAGING_SERVICE_SID;

  return [
    {
      id: 'google_places',
      label: 'Google Places API',
      level: placesDiscoveryConfigured() ? 'ready' : 'missing',
      detail: placesDiscoveryConfigured()
        ? 'Lead Radar Google Places scan + review sync enabled.'
        : 'Set GOOGLE_PLACES_API_KEY — enables Lead Radar discovery only.',
    },
    {
      id: 'google_maps',
      label: 'Google Maps render (browser)',
      level: googleMapsRenderConfigured() ? 'ready' : 'missing',
      detail: googleMapsRenderConfigured()
        ? 'Map UI layers enabled.'
        : 'Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — map UI disabled; list mode still works.',
    },
    {
      id: 'apple_maps',
      label: 'Apple MapKit',
      level: appleMapKitCredentialsPresent() ? 'optional' : 'optional',
      detail: appleMapKitCredentialsPresent()
        ? 'Optional alternative map layer available.'
        : 'Optional — does not block Lead Radar or booking.',
    },
    {
      id: 'twilio',
      label: 'Twilio SMS',
      level: !twilioCreds ? 'missing' : twilioReady ? (twilioTrial ? 'trial' : 'ready') : 'missing',
      detail: !twilioCreds
        ? 'Missing TWILIO_ACCOUNT_SID / AUTH_TOKEN.'
        : !twilioReady
          ? 'Credentials present but no From number or Messaging Service SID.'
          : twilioTrial
            ? 'Trial mode active — SMS sends to verified numbers only.'
            : 'Production messaging ready.',
    },
    {
      id: 'resend',
      label: 'Resend email',
      level: resendConfigured() ? 'ready' : 'missing',
      detail: resendConfigured()
        ? 'Owner + customer email delivery configured. Owner alerts forward to workspace email from Setup Center.'
        : 'Set RESEND_API_KEY and RESEND_FROM_EMAIL.',
    },
    {
      id: 'google_calendar',
      label: 'Google Calendar sync',
      level: googleCalendarOAuthConfigured() ? 'optional' : 'optional',
      detail: googleCalendarOAuthConfigured()
        ? 'OAuth ready — connect in Setup Center to push bookings to Google Calendar.'
        : 'Set GOOGLE_CALENDAR_CLIENT_ID/SECRET/REDIRECT_URI, then connect in Setup Center.',
    },
    {
      id: 'analytics',
      label: 'Site analytics (GA + Clarity)',
      level: 'ready',
      detail: 'Google Tag G-VWFWQ0P9GB and Microsoft Clarity load on every page via root layout.',
    },
  ];
}

export function twilioStatusLabel(): string {
  const rows = buildIntegrationStatusRows();
  const tw = rows.find((r) => r.id === 'twilio');
  if (!tw) return 'Unknown';
  if (tw.level === 'trial') return 'Trial mode active';
  if (tw.level === 'ready') return 'Production verified';
  if (tw.level === 'missing') return 'Not configured';
  return tw.detail;
}
