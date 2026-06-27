export const GOOGLE_CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

export function googleCalendarOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim(),
  );
}

export function googleCalendarRedirectUri(): string {
  const explicit = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '');
  return `${base}/api/admin/google-calendar/callback`;
}

export function googleCalendarClientId(): string | null {
  return process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() || null;
}

export function googleCalendarClientSecret(): string | null {
  return process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() || null;
}
