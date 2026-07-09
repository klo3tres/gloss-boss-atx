import type { AppRole } from '@/lib/auth/roles';
import { isStaffRole } from '@/lib/auth/roles';
import { getSafeInternalRedirect } from '@/lib/auth/safe-redirect';
import { OWNER_LOGIN_EMAIL } from '@/lib/auth/role-resolution';

export function defaultDashboardPathForRole(role: AppRole): string {
  switch (role) {
    case 'super_admin':
      return '/admin/super';
    case 'admin':
    case 'dispatcher':
      return '/admin';
    case 'viewer':
      return '/admin';
    case 'technician':
      return '/tech';
    default:
      return '/dashboard';
  }
}

/** Staff must not be sent to customer portal via ?next= */
export function resolveSafePostLoginRedirect(role: AppRole, nextParam: string | null, email?: string | null): string {
  const staffDefault = resolveDashboardPathForRole(role, null, email);
  if (!nextParam?.trim()) return staffDefault;
  const safeNext = getSafeInternalRedirect(nextParam, staffDefault);
  if (
    isStaffRole(role) &&
    (safeNext === '/dashboard' ||
      safeNext.startsWith('/dashboard?') ||
      safeNext === '/customer' ||
      safeNext.startsWith('/customer/'))
  ) {
    return staffDefault;
  }
  return safeNext;
}

/**
 * Post-auth navigation. Owner account always lands on `/admin/super` (hard override).
 * Otherwise honors safe `redirectTo` when present.
 */
export function resolveDashboardPathForRole(role: AppRole, redirectToParam: string | null, email?: string | null): string {
  if ((email ?? '').trim().toLowerCase() === OWNER_LOGIN_EMAIL) {
    return '/admin/super';
  }
  const fallback = defaultDashboardPathForRole(role);
  if (redirectToParam != null && redirectToParam.trim().length > 0) {
    return resolveSafePostLoginRedirect(role, redirectToParam, email);
  }
  return fallback;
}
