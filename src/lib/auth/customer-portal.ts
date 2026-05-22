import type { AppRole } from '@/lib/auth/roles';

/** Roles allowed to use customer dashboard UI (including admin preview). */
export function canAccessCustomerPortal(role: string | null | undefined): role is AppRole {
  return role === 'customer' || role === 'admin' || role === 'super_admin';
}
