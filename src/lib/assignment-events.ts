import type { SupabaseClient } from '@supabase/supabase-js';

export type AssignmentEntity = 'lead' | 'appointment';

export type AssignmentAction = 'assign' | 'reassign' | 'unassign' | 'claim' | 'pool_on' | 'pool_off' | 'convert';

export async function recordAssignmentEvent(
  client: SupabaseClient,
  args: {
    entityType: AssignmentEntity;
    entityId: string;
    action: AssignmentAction;
    technicianId: string | null;
    previousTechnicianId: string | null;
    actorId: string;
    note?: string | null;
    meta?: Record<string, unknown>;
  },
): Promise<{ error: string | null }> {
  const { error } = await client.from('assignment_events').insert({
    entity_type: args.entityType,
    entity_id: args.entityId,
    action: args.action,
    technician_id: args.technicianId,
    previous_technician_id: args.previousTechnicianId,
    actor_id: args.actorId,
    note: args.note ?? null,
    meta: args.meta ?? {},
  });
  return { error: error?.message ?? null };
}
