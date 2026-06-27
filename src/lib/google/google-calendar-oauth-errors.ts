export type GoogleCalendarOAuthErrorCode =
  | 'missing_client_id'
  | 'missing_client_secret'
  | 'redirect_uri_mismatch'
  | 'access_denied'
  | 'token_exchange_failed'
  | 'database_write_failed'
  | 'no_authenticated_admin'
  | 'oauth_state_mismatch'
  | 'oauth_missing_code'
  | 'service_role_unavailable'
  | 'unknown_calendar_error';

export const GOOGLE_CALENDAR_OAUTH_ERROR_MESSAGES: Record<GoogleCalendarOAuthErrorCode, string> = {
  missing_client_id: 'Google Calendar client ID is missing in Vercel env.',
  missing_client_secret: 'Google Calendar client secret is missing in Vercel env.',
  redirect_uri_mismatch:
    'Redirect URI mismatch — GOOGLE_CALENDAR_REDIRECT_URI must exactly match Google Cloud Console.',
  access_denied: 'Google access was denied. Click Connect again and approve calendar access.',
  token_exchange_failed: 'Google token exchange failed. Try reconnecting.',
  database_write_failed:
    'Could not save Google Calendar connection. Apply Supabase migration 000105 (and 000106) then retry.',
  no_authenticated_admin: 'Sign in as an admin before connecting Google Calendar.',
  oauth_state_mismatch: 'OAuth session expired. Start Connect again from Setup Center.',
  oauth_missing_code: 'Google did not return an authorization code.',
  service_role_unavailable: 'Server cannot write calendar tokens — check SUPABASE_SERVICE_ROLE_KEY.',
  unknown_calendar_error: 'Google Calendar connection failed for an unexpected reason.',
};

export function mapGoogleTokenError(raw: string | undefined): GoogleCalendarOAuthErrorCode {
  const msg = (raw ?? '').toLowerCase();
  if (msg.includes('redirect_uri_mismatch') || msg.includes('redirect uri')) return 'redirect_uri_mismatch';
  if (msg.includes('invalid_client') && msg.includes('secret')) return 'missing_client_secret';
  if (msg.includes('invalid_client')) return 'missing_client_id';
  if (msg.includes('access_denied')) return 'access_denied';
  return 'token_exchange_failed';
}
