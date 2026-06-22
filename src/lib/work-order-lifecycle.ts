import type { SupabaseClient } from '@supabase/supabase-js';

export const WORK_ORDER_STAGES = [
  'lead',
  'estimate',
  'approved',
  'scheduled',
  'en_route',
  'in_progress',
  'quality_check',
  'payment_due',
  'completed',
  'cancelled',
] as const;

export type WorkOrderStage = (typeof WORK_ORDER_STAGES)[number];

const transitions: Record<WorkOrderStage, WorkOrderStage[]> = {
  lead: ['estimate', 'approved', 'cancelled'],
  estimate: ['approved', 'cancelled'],
  approved: ['scheduled', 'cancelled'],
  scheduled: ['en_route', 'in_progress', 'cancelled'],
  en_route: ['in_progress', 'scheduled', 'cancelled'],
  in_progress: ['quality_check', 'payment_due', 'cancelled'],
  quality_check: ['in_progress', 'payment_due', 'completed'],
  payment_due: ['quality_check', 'completed'],
  completed: [],
  cancelled: ['scheduled'],
};

export function stageFromLegacyStatus(status: unknown): WorkOrderStage {
  const value = String(status ?? '').trim().toLowerCase();
  if (['awaiting_payment', 'pending', 'new'].includes(value)) return 'approved';
  if (['deposit_paid', 'confirmed', 'assigned', 'scheduled'].includes(value)) return 'scheduled';
  if (value === 'en_route') return 'en_route';
  if (value === 'in_progress') return 'in_progress';
  if (value === 'quality_check') return 'quality_check';
  if (value === 'payment_due' || value === 'balance_due') return 'payment_due';
  if (value === 'completed') return 'completed';
  if (['cancelled', 'canceled', 'deleted', 'archived'].includes(value)) return 'cancelled';
  return 'lead';
}

export function legacyStatusForStage(stage: WorkOrderStage): string {
  if (stage === 'approved') return 'awaiting_payment';
  if (stage === 'scheduled') return 'confirmed';
  return stage;
}

export function canTransitionWorkOrder(from: WorkOrderStage, to: WorkOrderStage, allowAdminOverride = false) {
  return from === to || allowAdminOverride || transitions[from].includes(to);
}

export async function transitionWorkOrder(
  db: SupabaseClient,
  input: {
    appointmentId: string;
    to: WorkOrderStage;
    actorId?: string | null;
    reason?: string;
    allowAdminOverride?: boolean;
    legacyStatus?: string;
    extraPatch?: Record<string, unknown>;
  },
): Promise<{ ok: boolean; error?: string; from?: WorkOrderStage; to?: WorkOrderStage }> {
  let load = await db
    .from('appointments')
    .select('id, status, lifecycle_stage')
    .eq('id', input.appointmentId)
    .maybeSingle();
  if (load.error && /lifecycle_stage|schema cache|column/i.test(load.error.message)) {
    load = await db.from('appointments').select('id, status').eq('id', input.appointmentId).maybeSingle();
  }
  const row = load.data as { id?: string; status?: string; lifecycle_stage?: string } | null;
  if (load.error) return { ok: false, error: load.error.message };
  if (!row) return { ok: false, error: 'Work order not found.' };

  const from = stageFromLegacyStatus((row as Record<string, unknown>).lifecycle_stage || row.status);
  if (!canTransitionWorkOrder(from, input.to, input.allowAdminOverride)) {
    return { ok: false, error: `Invalid work-order transition: ${from} → ${input.to}.`, from, to: input.to };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: input.legacyStatus || legacyStatusForStage(input.to),
    lifecycle_stage: input.to,
    lifecycle_changed_at: now,
    updated_at: now,
    ...(input.extraPatch ?? {}),
  };
  if (input.to === 'in_progress') patch.job_started_at = now;
  if (input.to === 'completed') patch.job_completed_at = now;
  if (input.to === 'cancelled') patch.cancelled_at = now;

  let update = await db.from('appointments').update(patch).eq('id', input.appointmentId);
  if (update.error && /lifecycle_stage|lifecycle_changed_at|schema cache|column/i.test(update.error.message)) {
    const { lifecycle_stage: _stage, lifecycle_changed_at: _changed, ...legacyPatch } = patch;
    update = await db.from('appointments').update(legacyPatch).eq('id', input.appointmentId);
  }
  if (update.error) return { ok: false, error: update.error.message, from, to: input.to };

  try {
    await db.from('work_order_transition_events').insert({
      appointment_id: input.appointmentId,
    from_stage: from,
    to_stage: input.to,
    actor_id: input.actorId ?? null,
    reason: input.reason || null,
    admin_override: input.allowAdminOverride === true,
    });
  } catch {
    // Migration may not be deployed yet; the status update remains authoritative.
  }

  return { ok: true, from, to: input.to };
}
