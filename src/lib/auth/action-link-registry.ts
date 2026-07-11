/**
 * Central registry for outbound action links.
 * Every auth/customer action email or SMS must resolve through this module.
 */

export type ActionLinkType =
  | 'staff_invite'
  | 'password_reset'
  | 'signup_confirmation'
  | 'customer_portal'
  | 'acknowledgment'
  | 'agreement'
  | 'payment'
  | 'referral'
  | 'review'
  | 'quote'
  | 'booking_confirmation'
  | 'membership_management'
  | 'gift_card'
  | 'loyalty_reward';

export type ActionLinkDefinition = {
  type: ActionLinkType;
  route: string;
  requiresToken: boolean;
  successDestination: string;
  expiredDestination: string;
  alreadyCompletedDestination: string;
  fallbackDestination: string;
  description: string;
};

export const ACTION_LINK_REGISTRY: Record<ActionLinkType, ActionLinkDefinition> = {
  staff_invite: {
    type: 'staff_invite',
    route: '/join-team',
    requiresToken: true,
    successDestination: '/tech',
    expiredDestination: '/join-team?error=expired',
    alreadyCompletedDestination: '/login?notice=invite_already_accepted',
    fallbackDestination: '/login?error=invite_help',
    description: 'Staff team invite setup',
  },
  password_reset: {
    type: 'password_reset',
    route: '/auth/callback',
    requiresToken: true,
    successDestination: '/reset-password',
    expiredDestination: '/forgot-password?error=expired',
    alreadyCompletedDestination: '/login?notice=password_already_updated',
    fallbackDestination: '/forgot-password',
    description: 'Password recovery via auth callback → reset form',
  },
  signup_confirmation: {
    type: 'signup_confirmation',
    route: '/auth/callback',
    requiresToken: true,
    successDestination: '/dashboard',
    expiredDestination: '/login?error=confirmation_expired',
    alreadyCompletedDestination: '/login?notice=already_confirmed',
    fallbackDestination: '/login?notice=resend_confirmation',
    description: 'Email confirmation for customer signup',
  },
  customer_portal: {
    type: 'customer_portal',
    route: '/portal/job',
    requiresToken: true,
    successDestination: '/dashboard',
    expiredDestination: '/login?error=portal_expired',
    alreadyCompletedDestination: '/dashboard',
    fallbackDestination: '/login?next=/dashboard',
    description: 'Customer portal magic access',
  },
  acknowledgment: {
    type: 'acknowledgment',
    route: '/agreement',
    requiresToken: true,
    successDestination: '/agreement?notice=signed',
    expiredDestination: '/agreement?error=expired',
    alreadyCompletedDestination: '/agreement?notice=already_signed',
    fallbackDestination: '/book/confirmation',
    description: 'Service acknowledgment signing (legacy alias)',
  },
  agreement: {
    type: 'agreement',
    route: '/agreement',
    requiresToken: true,
    successDestination: '/agreement?notice=signed',
    expiredDestination: '/agreement?error=expired',
    alreadyCompletedDestination: '/agreement?notice=already_signed',
    fallbackDestination: '/book/confirmation',
    description: 'Service acknowledgment / agreement signing',
  },
  payment: {
    type: 'payment',
    route: '/pay/balance',
    requiresToken: true,
    successDestination: '/dashboard',
    expiredDestination: '/login?error=pay_expired',
    alreadyCompletedDestination: '/dashboard',
    fallbackDestination: '/dashboard',
    description: 'Balance payment link',
  },
  referral: {
    type: 'referral',
    route: '/book',
    requiresToken: true,
    successDestination: '/book',
    expiredDestination: '/referrals?error=expired',
    alreadyCompletedDestination: '/book',
    fallbackDestination: '/referrals',
    description: 'Referral share / redeem via booking attribution',
  },
  review: {
    type: 'review',
    route: '/review',
    requiresToken: true,
    successDestination: '/',
    expiredDestination: '/login?error=review_expired',
    alreadyCompletedDestination: '/',
    fallbackDestination: '/',
    description: 'Post-job review request',
  },
  quote: {
    type: 'quote',
    route: '/estimate',
    requiresToken: true,
    successDestination: '/estimate',
    expiredDestination: '/estimate?error=expired',
    alreadyCompletedDestination: '/estimate',
    fallbackDestination: '/book',
    description: 'Public estimate / quote',
  },
  booking_confirmation: {
    type: 'booking_confirmation',
    route: '/book/confirmation',
    requiresToken: false,
    successDestination: '/book/confirmation',
    expiredDestination: '/book',
    alreadyCompletedDestination: '/book/confirmation',
    fallbackDestination: '/dashboard',
    description: 'Booking confirmation page',
  },
  membership_management: {
    type: 'membership_management',
    route: '/memberships',
    requiresToken: false,
    successDestination: '/dashboard',
    expiredDestination: '/memberships',
    alreadyCompletedDestination: '/dashboard',
    fallbackDestination: '/dashboard/settings',
    description: 'Membership manage / checkout',
  },
  gift_card: {
    type: 'gift_card',
    route: '/gift-cards',
    requiresToken: false,
    successDestination: '/gift-cards/success',
    expiredDestination: '/gift-cards',
    alreadyCompletedDestination: '/gift-cards/success',
    fallbackDestination: '/gift-cards',
    description: 'Gift card purchase / redeem',
  },
  loyalty_reward: {
    type: 'loyalty_reward',
    route: '/dashboard',
    requiresToken: false,
    successDestination: '/dashboard',
    expiredDestination: '/login?next=/dashboard',
    alreadyCompletedDestination: '/dashboard',
    fallbackDestination: '/login?next=/dashboard',
    description: 'Loyalty rewards in customer portal',
  },
};

export function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.glossbossatx.com').replace(
    /\/$/,
    '',
  );
}

/** Password recovery redirect that must be allow-listed in Supabase Auth settings. */
export function passwordResetRedirectUrl(): string {
  const next = encodeURIComponent(ACTION_LINK_REGISTRY.password_reset.successDestination);
  return `${appOrigin()}${ACTION_LINK_REGISTRY.password_reset.route}?next=${next}&type=recovery`;
}

export function staffInviteUrl(token: string): string {
  return `${appOrigin()}${ACTION_LINK_REGISTRY.staff_invite.route}?token=${encodeURIComponent(token)}`;
}

export function signupConfirmRedirectUrl(): string {
  return `${appOrigin()}/auth/callback?next=${encodeURIComponent('/dashboard')}&type=signup`;
}

/** Canonical customer agreement signing URL (token = appointment access_token). */
export function agreementUrl(input: { appointmentId: string; token: string; sessionId?: string }): string {
  const q = new URLSearchParams();
  q.set('appointment_id', input.appointmentId);
  q.set('token', input.token);
  if (input.sessionId) q.set('session_id', input.sessionId);
  return `${appOrigin()}${ACTION_LINK_REGISTRY.agreement.route}?${q.toString()}`;
}

export function referralBookingUrl(code: string): string {
  return `${appOrigin()}/book?ref=${encodeURIComponent(code)}`;
}

export function reviewUrl(appointmentId: string): string {
  return `${appOrigin()}/review/${encodeURIComponent(appointmentId)}`;
}

export function paymentBalanceUrl(appointmentId: string, token?: string): string {
  const q = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${appOrigin()}/pay/balance/${encodeURIComponent(appointmentId)}${q}`;
}

export function quoteEstimateUrl(token: string): string {
  return `${appOrigin()}/estimate/${encodeURIComponent(token)}`;
}

/** Static checks for CI / admin diagnostics. */
export function validateActionLinkRegistry(): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const requiredRoutes = new Set(Object.values(ACTION_LINK_REGISTRY).map((d) => d.route.split('?')[0]));
  for (const def of Object.values(ACTION_LINK_REGISTRY)) {
    if (!def.route.startsWith('/')) issues.push(`${def.type}: route must be absolute path`);
    if (!def.successDestination.startsWith('/')) issues.push(`${def.type}: successDestination invalid`);
    if (!def.expiredDestination.startsWith('/')) issues.push(`${def.type}: expiredDestination invalid`);
    if (!def.alreadyCompletedDestination.startsWith('/')) issues.push(`${def.type}: alreadyCompletedDestination invalid`);
    if (!def.fallbackDestination.startsWith('/')) issues.push(`${def.type}: fallbackDestination invalid`);
    if (def.type === 'agreement' && def.route !== '/agreement') issues.push('agreement must route to /agreement');
    if (def.type === 'referral' && !def.route.startsWith('/book')) issues.push('referral must attribute via /book');
  }
  if (!requiredRoutes.has('/agreement')) issues.push('missing /agreement route coverage');
  return { ok: issues.length === 0, issues };
}
