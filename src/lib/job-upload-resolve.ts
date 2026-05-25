import type { SupabaseClient } from '@supabase/supabase-js';
import { isAdminLevel, type AppRole } from '@/lib/auth/roles';
import { resolveWorkOrder, type Row } from '@/lib/work-order-resolve';

export type MediaUploadJobContext = {
  appointmentId: string;
  fallbackBookingId: string;
  customerId: string | null;
  vehicleId: string | null;
  isFallback: boolean;
  orphanSession: boolean;
  status: string;
  assignedTechnicianId: string | null;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function canAccessJob(role: AppRole | null, userId: string, assigned: string | null, status: string): boolean {
  if (isAdminLevel(role)) return true;
  if (!assigned || assigned === userId) return true;
  const st = status.toLowerCase();
  if (st === 'completed' || st === 'in_progress' || st === 'confirmed' || st === 'scheduled') {
    return role === 'technician' || role === 'admin' || role === 'super_admin';
  }
  return false;
}

/**
 * Same resolution chain as the work order page — use before rejecting uploads.
 */
export async function resolveJobForMediaUpload(
  admin: SupabaseClient,
  input: {
    workOrderId?: string;
    appointmentId?: string;
    fallbackBookingId?: string;
    workflowSessionId?: string;
  },
): Promise<MediaUploadJobContext | null> {
  const candidates = [str(input.workOrderId), str(input.appointmentId), str(input.fallbackBookingId), str(input.workflowSessionId)].filter(
    Boolean,
  );
  for (const id of candidates) {
    const resolved = await resolveWorkOrder(admin, id);
    if (!resolved?.row) continue;
    const row = resolved.row as Row;
    const canonicalId = str(resolved.canonicalId) || id;
    const isFallback = resolved.isFallback;
    return {
      appointmentId: isFallback ? '' : canonicalId,
      fallbackBookingId: isFallback ? canonicalId : '',
      customerId: str(row.customer_id) || null,
      vehicleId: str(row.vehicle_id) || null,
      isFallback,
      orphanSession: Boolean(resolved.orphanSession),
      status: str(row.status) || 'in_progress',
      assignedTechnicianId: str(row.assigned_technician_id) || null,
    };
  }
  return null;
}

export function assertMediaUploadAccess(
  role: AppRole | null,
  userId: string,
  ctx: MediaUploadJobContext,
): string | null {
  if (ctx.orphanSession) {
    return 'Archived or walk-in session only — link a real appointment before uploading photos.';
  }
  if (!canAccessJob(role, userId, ctx.assignedTechnicianId, ctx.status)) {
    return 'You do not have access to upload photos for this job.';
  }
  return null;
}
