import type { SupabaseClient } from '@supabase/supabase-js';

export type AutomationRunResult<T> = {
  ok: boolean;
  jobKey: string;
  runId?: string;
  durationMs: number;
  result?: T;
  error?: string;
  alreadyRunning?: boolean;
};

export async function runTrackedAutomation<T>(
  admin: SupabaseClient,
  jobKey: string,
  trigger: 'cron' | 'manual',
  task: () => Promise<T>,
): Promise<AutomationRunResult<T>> {
  const started = Date.now();
  const staleBefore = new Date(started - 15 * 60_000).toISOString();
  const active = await admin
    .from('titan_automation_runs')
    .select('id')
    .eq('job_key', jobKey)
    .eq('status', 'running')
    .gte('started_at', staleBefore)
    .limit(1)
    .maybeSingle();
  if (active.data?.id) {
    return { ok: false, jobKey, durationMs: Date.now() - started, alreadyRunning: true, error: 'This automation is already running.' };
  }
  await admin.from('titan_automation_runs').update({
    status: 'failed', finished_at: new Date().toISOString(), error_message: 'Marked stale before a new run started.',
  }).eq('job_key', jobKey).eq('status', 'running').lt('started_at', staleBefore);

  const inserted = await admin
    .from('titan_automation_runs')
    .insert({ job_key: jobKey, status: 'running', trigger, started_at: new Date(started).toISOString() })
    .select('id')
    .maybeSingle();
  const runId = inserted.data?.id ? String(inserted.data.id) : undefined;
  if (inserted.error && !/does not exist|schema cache/i.test(inserted.error.message)) {
    return { ok: false, jobKey, durationMs: Date.now() - started, error: inserted.error.message };
  }

  try {
    const result = await task();
    const durationMs = Date.now() - started;
    if (runId) {
      await admin.from('titan_automation_runs').update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        result,
      }).eq('id', runId);
    }
    return { ok: true, jobKey, runId, durationMs, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - started;
    if (runId) {
      await admin.from('titan_automation_runs').update({
        status: 'failed', finished_at: new Date().toISOString(), duration_ms: durationMs, error_message: message,
      }).eq('id', runId);
    }
    return { ok: false, jobKey, runId, durationMs, error: message };
  }
}
