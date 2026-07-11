export type TitanConfigState = 'configured' | 'missing' | 'not_tested';

function value(...keys: string[]): string {
  for (const key of keys) {
    const found = process.env[key]?.trim();
    if (found) return found;
  }
  return '';
}

export const titanConfig = {
  appUrl: () => value('NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SITE_URL'),
  supabaseUrl: () => value('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: () => value('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  serviceRoleKey: () => value('SUPABASE_SERVICE_ROLE_KEY'),
  cronSecret: () => value('CRON_SECRET'),
  googlePlacesKey: () => value('GOOGLE_PLACES_API_KEY', 'GOOGLE_MAPS_API_KEY'),
  googleMapsPublicKey: () => value('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'),
  weatherKey: () => value('OPENWEATHER_API_KEY', 'OPENWEATHER_API_KE'),
  twilioAccountSid: () => value('TWILIO_ACCOUNT_SID'),
  twilioAuthToken: () => value('TWILIO_AUTH_TOKEN'),
  twilioSender: () => value('TWILIO_FROM_NUMBER', 'TWILIO_PHONE_NUMBER', 'TWILIO_MESSAGING_SERVICE_SID'),
  resendKey: () => value('RESEND_API_KEY'),
  resendFrom: () => value('RESEND_FROM_EMAIL'),
  stripeKey: () => value('STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY_LIVE'),
  stripeWebhookSecret: () => value('STRIPE_WEBHOOK_SECRET'),
  googleCalendarClientId: () => value('GOOGLE_CALENDAR_CLIENT_ID'),
  googleCalendarClientSecret: () => value('GOOGLE_CALENDAR_CLIENT_SECRET'),
};

export function configured(...checks: Array<() => string>): boolean {
  return checks.every((check) => Boolean(check()));
}

export function titanConfigSummary() {
  return {
    appUrl: configured(titanConfig.appUrl),
    supabase: configured(titanConfig.supabaseUrl, titanConfig.supabaseAnonKey),
    serviceRole: configured(titanConfig.serviceRoleKey),
    cron: configured(titanConfig.cronSecret),
    places: configured(titanConfig.googlePlacesKey),
    maps: configured(titanConfig.googleMapsPublicKey),
    weather: configured(titanConfig.weatherKey),
    twilio: configured(titanConfig.twilioAccountSid, titanConfig.twilioAuthToken, titanConfig.twilioSender),
    resend: configured(titanConfig.resendKey, titanConfig.resendFrom),
    stripe: configured(titanConfig.stripeKey),
    stripeWebhook: configured(titanConfig.stripeWebhookSecret),
    googleCalendar: configured(titanConfig.googleCalendarClientId, titanConfig.googleCalendarClientSecret),
  };
}
