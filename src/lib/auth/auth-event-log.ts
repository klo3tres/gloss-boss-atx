import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthEventType =
  | 'invite_created'
  | 'invite_sent'
  | 'invite_delivery_failed'
  | 'invite_opened'
  | 'invite_accepted'
  | 'confirmation_requested'
  | 'confirmation_sent'
  | 'confirmation_failed'
  | 'email_confirmed'
  | 'reset_requested'
  | 'reset_sent'
  | 'reset_opened'
  | 'password_updated'
  | 'login_succeeded'
  | 'login_failed'
  | 'profile_resolution_succeeded'
  | 'profile_resolution_failed'
  | 'role_resolved'
  | 'ambiguous_account_detected'
  | 'auth_email_changed'
  | 'account_disabled'
  | 'staff_auth_created';

/** Never log passwords or raw tokens. */
export async function logAuthEvent(
  admin: SupabaseClient,
  input: {
    eventType: AuthEventType;
    actorUserId?: string | null;
    subjectUserId?: string | null;
    subjectEmail?: string | null;
    detail?: string | null;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await admin.from('auth_event_log').insert({
      event_type: input.eventType,
      actor_user_id: input.actorUserId ?? null,
      subject_user_id: input.subjectUserId ?? null,
      subject_email: input.subjectEmail ? input.subjectEmail.trim().toLowerCase() : null,
      detail: input.detail ?? null,
      meta: input.meta ?? {},
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[auth_event_log]', input.eventType, e instanceof Error ? e.message : e);
  }
}

/** Map technical Supabase/Postgres errors to safe user copy. */
export function humanizeAuthError(raw: string | null | undefined): string {
  const msg = (raw ?? '').toLowerCase();
  if (!msg) return 'Something went wrong. Please try again.';
  if (msg.includes('infinite recursion') || msg.includes('policy for relation "profiles"')) {
    return 'We couldn’t finish setting up your account. Your account is safe, but the profile connection failed. Please retry or contact your administrator.';
  }
  if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
    return 'Please confirm your email before signing in. Use Resend confirmation if you did not receive a message.';
  }
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
    return 'Email or password is incorrect.';
  }
  if (msg.includes('expired') || msg.includes('otp_expired')) {
    return 'This link has expired. Request a new one and try again.';
  }
  if (msg.includes('already registered') || msg.includes('user already')) {
    return 'An account with this email already exists. Sign in or use Forgot password.';
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  // Never surface raw SQL / policy text
  if (msg.includes('policy') || msg.includes('permission denied') || msg.includes('row-level')) {
    return 'We couldn’t finish setting up your account. Please retry or contact your administrator.';
  }
  return raw!.length > 160 ? 'Something went wrong. Please try again or contact your administrator.' : raw!;
}
