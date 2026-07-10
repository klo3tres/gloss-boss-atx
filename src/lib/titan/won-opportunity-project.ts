import type { SupabaseClient } from '@supabase/supabase-js';
import { GLOSS_BOSS_BUSINESS_ID } from '@/lib/titan/business-context';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export async function createProjectFromBookedOpportunity(
  admin: SupabaseClient,
  opportunityId: string,
): Promise<{ ok: boolean; projectId?: string; skipped?: boolean; error?: string }> {
  const { data: opp } = await admin.from('titan_opportunities').select('*').eq('id', opportunityId).maybeSingle();
  if (!opp) return { ok: false, error: 'Opportunity not found' };
  const row = opp as Record<string, unknown>;
  const businessId = str(row.business_id) || GLOSS_BOSS_BUSINESS_ID;
  const title = str(row.title) || 'Won opportunity';

  const { data: existing } = await admin
    .from('titan_projects')
    .select('id')
    .eq('opportunity_id', opportunityId)
    .maybeSingle();
  if (existing?.id) return { ok: true, projectId: str(existing.id), skipped: true };

  const projectType = ['fleet', 'dealership', 'apartment_hoa', 'google_places'].includes(str(row.opportunity_type))
    ? 'fleet_contract'
    : 'detailing_job';

  const due = new Date();
  due.setDate(due.getDate() + 14);

  const { data, error } = await admin
    .from('titan_projects')
    .insert({
      business_id: businessId,
      opportunity_id: opportunityId,
      title: `${title} — delivery`,
      project_type: projectType,
      status: 'active',
      due_at: due.toISOString(),
      notes: `Auto-created when opportunity marked booked. Contact: ${str(row.author_name) || '—'} ${str(row.contact_phone) || ''}`.trim(),
    })
    .select('id')
    .single();

  if (error) {
    if (error.message.includes('does not exist')) return { ok: false, error: 'Apply migration 000121 for titan_projects.' };
    return { ok: false, error: error.message };
  }

  await admin.from('titan_opportunity_events').insert({
    opportunity_id: opportunityId,
    event_type: 'project_created',
    notes: `Project ${str((data as { id?: string })?.id)} created from booked status`,
    workspace_key: str(row.workspace_key) || 'default',
  });

  return { ok: true, projectId: str((data as { id?: string })?.id) };
}
