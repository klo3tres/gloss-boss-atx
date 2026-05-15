import type { AppRole } from '@/lib/auth/roles';
import { getSafeInternalRedirect } from '@/lib/auth/safe-redirect';
import { OWNER_LOGIN_EMAIL } from '@/lib/auth/role-resolution';

export function defaultDashboardPathForRole(role: AppRole): string {
  switch (role) {
    case 'super_admin':
      return '/admin/super';
    case 'admin':
      return '/admin';
    case 'technician':
      return '/tech';
    default:
      return '/dashboard';
  }
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
    return getSafeInternalRedirect(redirectToParam, fallback);
  }
  return fallback;
}
