export type AppRole = 'super_admin' | 'admin' | 'technician' | 'customer';

export function isStaffRole(role: AppRole | null | undefined): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'technician';
}

export function isAdminLevel(role: AppRole | null | undefined): boolean {
  return role === 'super_admin' || role === 'admin';
}
