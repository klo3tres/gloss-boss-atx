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
  | 'payment'
  | 'referral'
  | 'review'
  | 'quote'
  | 'booking_confirmation'
  | 'membership_management';

export type ActionLinkDefinition = {
  type: ActionLinkType;
  route: string;
  requiresToken: boolean;
  successDestination: string;
  expiredDestination: string;
  alreadyCompletedDestination: string;
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
    description: 'Staff team invite setup',
  },
  password_reset: {
    type: 'password_reset',
    route: '/auth/callback',
    requiresToken: true,
    successDestination: '/reset-password',
    expiredDestination: '/forgot-password?error=expired',
    alreadyCompletedDestination: '/login?notice=password_already_updated',
    description: 'Password recovery via auth callback → reset form',
  },
  signup_confirmation: {
    type: 'signup_confirmation',
    route: '/auth/callback',
    requiresToken: true,
    successDestination: '/dashboard',
    expiredDestination: '/login?error=confirmation_expired',
    alreadyCompletedDestination: '/login?notice=already_confirmed',
    description: 'Email confirmation for customer signup',
  },
  customer_portal: {
    type: 'customer_portal',
    route: '/portal/job',
    requiresToken: true,
    successDestination: '/dashboard',
    expiredDestination: '/login?error=portal_expired',
    alreadyCompletedDestination: '/dashboard',
    description: 'Customer portal magic access',
  },
  acknowledgment: {
    type: 'acknowledgment',
    route: '/acknowledgement',
    requiresToken: true,
    successDestination: '/book/confirmation',
    expiredDestination: '/login?error=ack_expired',
    alreadyCompletedDestination: '/book/confirmation',
    description: 'Service acknowledgment signing',
  },
  payment: {
    type: 'payment',
    route: '/pay/balance',
    requiresToken: true,
    successDestination: '/dashboard',
    expiredDestination: '/login?error=pay_expired',
    alreadyCompletedDestination: '/dashboard',
    description: 'Balance payment link',
  },
  referral: {
    type: 'referral',
    route: '/referrals',
    requiresToken: true,
    successDestination: '/book',
    expiredDestination: '/referrals?error=expired',
    alreadyCompletedDestination: '/book',
    description: 'Referral share / redeem',
  },
  review: {
    type: 'review',
    route: '/review',
    requiresToken: true,
    successDestination: '/',
    expiredDestination: '/',
    alreadyCompletedDestination: '/',
    description: 'Post-job review request',
  },
  quote: {
    type: 'quote',
    route: '/estimate',
    requiresToken: true,
    successDestination: '/estimate',
    expiredDestination: '/estimate?error=expired',
    alreadyCompletedDestination: '/estimate',
    description: 'Public estimate / quote',
  },
  booking_confirmation: {
    type: 'booking_confirmation',
    route: '/book/confirmation',
    requiresToken: false,
    successDestination: '/book/confirmation',
    expiredDestination: '/book',
    alreadyCompletedDestination: '/book/confirmation',
    description: 'Booking confirmation page',
  },
  membership_management: {
    type: 'membership_management',
    route: '/memberships',
    requiresToken: false,
    successDestination: '/dashboard',
    expiredDestination: '/memberships',
    alreadyCompletedDestination: '/dashboard',
    description: 'Membership manage / checkout',
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

/** Static checks for CI / admin diagnostics. */
export function validateActionLinkRegistry(): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  for (const def of Object.values(ACTION_LINK_REGISTRY)) {
    if (!def.route.startsWith('/')) issues.push(`${def.type}: route must be absolute path`);
    if (!def.successDestination.startsWith('/')) issues.push(`${def.type}: successDestination invalid`);
    if (!def.expiredDestination.startsWith('/')) issues.push(`${def.type}: expiredDestination invalid`);
  }
  return { ok: issues.length === 0, issues };
}
