import type { AppRole } from '@/lib/auth/roles';

const STORAGE_KEY = 'glossboss_auth_hydrated_once';

export function readHydratedOnceFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeHydratedOnceFlag(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearHydratedOnceFlag(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

let memoryRole: { userId: string; role: AppRole } | null = null;

export function getCachedRoleForUser(userId: string): AppRole | null {
  if (!userId || !memoryRole || memoryRole.userId !== userId) return null;
  return memoryRole.role;
}

export function setRoleCache(userId: string, role: AppRole): void {
  if (!userId) return;
  memoryRole = { userId, role };
}

export function clearRoleCache(): void {
  memoryRole = null;
}

export function clearAuthUxSession(): void {
  clearHydratedOnceFlag();
  clearRoleCache();
}
