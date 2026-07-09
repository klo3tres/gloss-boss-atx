export type AppRole = 'super_admin' | 'admin' | 'dispatcher' | 'technician' | 'viewer' | 'customer';

export function isStaffRole(role: AppRole | null | undefined): boolean {
  return (
    role === 'super_admin' ||
    role === 'admin' ||
    role === 'dispatcher' ||
    role === 'technician' ||
    role === 'viewer'
  );
}

export function isAdminLevel(role: AppRole | null | undefined): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'dispatcher';
}

/** Admin portal briefing + read-only surfaces (includes viewer). */
export function canAccessAdminPortal(role: AppRole | null | undefined): boolean {
  return isAdminLevel(role) || role === 'viewer';
}

export function isViewerRole(role: AppRole | null | undefined): boolean {
  return role === 'viewer';
}

export function dashboardShellRoleForProfile(
  role: AppRole | null | undefined,
): 'super_admin' | 'admin' | 'dispatcher' | 'viewer' | 'technician' | 'customer' {
  if (role === 'super_admin') return 'super_admin';
  if (role === 'viewer') return 'viewer';
  if (role === 'dispatcher') return 'dispatcher';
  if (role === 'admin') return 'admin';
  if (role === 'technician') return 'technician';
  return 'customer';
}
