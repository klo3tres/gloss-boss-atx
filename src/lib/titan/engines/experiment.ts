import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExperimentEngine, TitanExperiment } from '@/lib/titan/engines/types';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function mapRow(row: Record<string, unknown>): TitanExperiment {
  return {
    id: str(row.id),
    hypothesis: str(row.hypothesis),
    actionsPlanned: str(row.actions_planned),
    expectedRevenueCents: Number(row.expected_revenue_cents ?? 0),
    testLengthDays: Number(row.test_length_days ?? 14),
    status: str(row.status) as TitanExperiment['status'],
    result: row.result ? (str(row.result) as TitanExperiment['result']) : null,
    resultNotes: str(row.result_notes) || null,
    startedAt: str(row.started_at),
    endsAt: str(row.ends_at) || null,
  };
}

export async function loadExperimentEngine(admin: SupabaseClient): Promise<ExperimentEngine> {
  const probe = await admin.from('titan_experiments').select('id').limit(1);
  if (probe.error) {
    return { tablesReady: false, active: [], completed: [] };
  }

  const { data } = await admin
    .from('titan_experiments')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(20);

  const all = (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
  return {
    tablesReady: true,
    active: all.filter((e) => e.status === 'active'),
    completed: all.filter((e) => e.status === 'completed'),
  };
}

export async function createExperiment(
  admin: SupabaseClient,
  input: { hypothesis: string; actionsPlanned: string; expectedRevenueCents: number; testLengthDays?: number },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const probe = await admin.from('titan_experiments').select('id').limit(1);
  if (probe.error) return { ok: false, error: 'Apply migration 000094 for Titan Experiment Engine' };

  const days = input.testLengthDays ?? 14;
  const endsAt = new Date(Date.now() + days * 86400000).toISOString();
  const { data, error } = await admin
    .from('titan_experiments')
    .insert({
      hypothesis: input.hypothesis.trim(),
      actions_planned: input.actionsPlanned.trim(),
      expected_revenue_cents: input.expectedRevenueCents,
      test_length_days: days,
      ends_at: endsAt,
    })
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: str(data?.id) };
}

export async function completeExperiment(
  admin: SupabaseClient,
  id: string,
  result: 'pass' | 'fail' | 'inconclusive',
  notes?: string,
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { error } = await admin
    .from('titan_experiments')
    .update({
      status: 'completed',
      result,
      result_notes: notes?.trim() || null,
      completed_at: now,
      updated_at: now,
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await admin.from('titan_kpi_events').insert({
    kind: 'experiment_completed',
    amount_cents: 0,
    label: `Experiment ${result}`,
    source_id: id,
    metadata: { result, notes: notes ?? null },
  });

  return { ok: true };
}
