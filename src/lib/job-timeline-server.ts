import type { SupabaseClient } from '@supabase/supabase-js';
import { isSchemaDriftError } from '@/lib/booking-server-shared';

export type JobTimelineEventType =
  | 'job_started'
  | 'timer_started'
  | 'timer_stopped'
  | 'photo_before'
  | 'photo_after'
  | 'photo_inspection'
  | 'photo_damage'
  | 'checklist_saved'
  | 'job_completed'
  | 'payment_received'
  | 'intake_submitted';

/**
 * Best-effort audit log — never throws; ignores schema drift.
 */
export async function recordJobTimelineEvent(
  client: SupabaseClient,
  params: {
    appointmentId: string;
    eventType: JobTimelineEventType;
    meta?: Record<string, unknown>;
    createdBy?: string | null;
  },
): Promise<void> {
  const row: Record<string, unknown> = {
    appointment_id: params.appointmentId,
    event_type: params.eventType,
    meta: params.meta ?? {},
  };
  if (params.createdBy) row.created_by = params.createdBy;

  try {
    const res = await client.from('job_timeline_events').insert(row);
    if (res.error && isSchemaDriftError(res.error.message)) {
      const lean = { appointment_id: params.appointmentId, event_type: params.eventType };
      await client.from('job_timeline_events').insert(lean);
    } else if (res.error) {
      console.warn('[job_timeline]', params.appointmentId, params.eventType, res.error.message);
    }
  } catch (e) {
    console.warn('[job_timeline] unhandled', e);
  }
}
