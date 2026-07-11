import type { AppRole } from '@/lib/auth/roles';

/** Canonical protected super-admin email (Kyle Hawthorne / Gloss Boss owner). */
export const PROTECTED_OWNER_EMAIL =
  (process.env.PROTECTED_OWNER_EMAIL ?? process.env.OWNER_LOGIN_EMAIL ?? 'glossbossatx1@gmail.com').trim().toLowerCase();

/** Optional belt-and-suspenders protected user id from Supabase Auth. */
export const PROTECTED_OWNER_USER_ID = (process.env.PROTECTED_OWNER_USER_ID ?? '').trim();

/** @deprecated Use PROTECTED_OWNER_EMAIL */
export const OWNER_LOGIN_EMAIL = PROTECTED_OWNER_EMAIL;

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function isProtectedOwner(
  email: string | null | undefined,
  userId?: string | null | undefined,
): boolean {
  const e = normalizeEmail(email);
  if (e && e === PROTECTED_OWNER_EMAIL) return true;
  if (PROTECTED_OWNER_USER_ID && userId && userId === PROTECTED_OWNER_USER_ID) return true;
  return false;
}

export function canAssignRole(actorRole: AppRole | null, nextRole: AppRole, targetIsProtected: boolean): boolean {
  if (nextRole === 'super_admin') {
    return false;
  }
  if (targetIsProtected) {
    return false;
  }
  if (actorRole === 'super_admin') return true;
  if (actorRole === 'admin') {
    return ['admin', 'dispatcher', 'technician', 'viewer'].includes(nextRole);
  }
  return false;
}

export function canModifyStaffProfile(
  actorRole: AppRole | null,
  actorUserId: string,
  targetUserId: string,
  targetEmail: string | null | undefined,
): boolean {
  if (isProtectedOwner(targetEmail, targetUserId)) {
    return isProtectedOwner(null, actorUserId) || actorUserId === targetUserId;
  }
  if (actorRole === 'super_admin') return true;
  if (actorRole === 'admin') return true;
  return false;
}

export function parseStaffInviteRole(raw: unknown): AppRole | null {
  if (raw == null) return null;
  const key = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
  const staffRoles: AppRole[] = ['admin', 'dispatcher', 'technician', 'viewer'];
  return staffRoles.includes(key as AppRole) ? (key as AppRole) : null;
}
