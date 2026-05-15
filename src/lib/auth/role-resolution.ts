import type { AppRole } from '@/lib/auth/roles';

export const VALID_APP_ROLES: readonly AppRole[] = ['super_admin', 'admin', 'technician', 'customer'];

/** Normalize Postgres enum / odd client encodings to a snake_case key. */
export function normalizeRoleRaw(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') {
    return raw
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
      .replace(/_+/g, '_');
  }
  if (typeof raw === 'object' && raw !== null && 'value' in raw) {
    return normalizeRoleRaw((raw as { value: unknown }).value);
  }
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_');
}

const ROLE_SYNONYMS: Record<string, AppRole> = {
  superadmin: 'super_admin',
  super_admin: 'super_admin',
  superadministrator: 'super_admin',
  super_administrator: 'super_admin',
  admin: 'admin',
  administrator: 'admin',
  technician: 'technician',
  tech: 'technician',
  technologist: 'technician',
  detailer: 'technician',
  customer: 'customer',
  client: 'customer',
};

/**
 * Maps `profiles.role` to a canonical AppRole. Never defaults to customer.
 */
export function parseAppRole(raw: unknown): AppRole | null {
  const key = normalizeRoleRaw(raw);
  if (!key) return null;
  if (VALID_APP_ROLES.includes(key as AppRole)) return key as AppRole;
  const mapped = ROLE_SYNONYMS[key];
  return mapped ?? null;
}

/** Hard override for Gloss Boss owner account (code path + redirects). */
export const OWNER_LOGIN_EMAIL = 'glossbossatx1@gmail.com';

/**
 * Stable role resolution: owner email → super_admin; else valid DB role; else customer.
 * Never throws.
 */
export function resolveRoleWithFallback(email: string | null | undefined, profileRole: unknown): AppRole {
  const e = (email ?? '').trim().toLowerCase();
  if (e === OWNER_LOGIN_EMAIL) return 'super_admin';
  const fromDb = parseAppRole(profileRole);
  if (fromDb) return fromDb;
  return 'customer';
}

export function logRoleDebug(payload: Record<string, unknown>): void {
  console.info('[GLOSS_ROLE_DEBUG]', JSON.stringify(payload));
}
