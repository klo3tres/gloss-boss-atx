import type { SupabaseClient } from '@supabase/supabase-js';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { DEFAULT_WORKSPACE_KEY } from '@/lib/titan/workspace-keys';

import { GLOSS_BOSS_BUSINESS_ID } from '@/lib/titan/business-ids';

export { GLOSS_BOSS_BUSINESS_ID };

export type BusinessRecord = {
  id: string;
  workspaceKey: string;
  slug: string;
  name: string;
  industry: string;
  status: string;
  isPlatformTenant: boolean;
  websiteUrl: string | null;
  onboardingStep: number;
  onboardingCompletedAt: string | null;
};

export type BusinessContext = {
  businessId: string;
  workspaceKey: string;
  business: BusinessRecord;
  memberRole: 'owner' | 'admin' | 'member' | 'viewer' | 'staff';
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function mapBusiness(row: Record<string, unknown>): BusinessRecord {
  return {
    id: str(row.id),
    workspaceKey: str(row.workspace_key) || DEFAULT_WORKSPACE_KEY,
    slug: str(row.slug),
    name: str(row.name) || 'Business',
    industry: str(row.industry) || 'other',
    status: str(row.status) || 'active',
    isPlatformTenant: Boolean(row.is_platform_tenant),
    websiteUrl: str(row.website_url) || null,
    onboardingStep: Number(row.onboarding_step ?? 0) || 0,
    onboardingCompletedAt: str(row.onboarding_completed_at) || null,
  };
}

export function workspaceKeyToBusinessId(workspaceKey = DEFAULT_WORKSPACE_KEY): string {
  if (workspaceKey === DEFAULT_WORKSPACE_KEY) return GLOSS_BOSS_BUSINESS_ID;
  return workspaceKey;
}

export async function loadBusinessById(
  admin: SupabaseClient,
  businessId: string,
): Promise<BusinessRecord | null> {
  const { data } = await admin.from('businesses').select('*').eq('id', businessId).maybeSingle();
  if (!data) return null;
  return mapBusiness(data as Record<string, unknown>);
}

export async function loadBusinessByWorkspaceKey(
  admin: SupabaseClient,
  workspaceKey = DEFAULT_WORKSPACE_KEY,
): Promise<BusinessRecord | null> {
  const { data } = await admin
    .from('businesses')
    .select('*')
    .eq('workspace_key', workspaceKey)
    .maybeSingle();
  if (!data) {
    if (workspaceKey === DEFAULT_WORKSPACE_KEY) {
      return {
        id: GLOSS_BOSS_BUSINESS_ID,
        workspaceKey: DEFAULT_WORKSPACE_KEY,
        slug: 'gloss-boss-atx',
        name: 'Gloss Boss ATX',
        industry: 'mobile_detailing',
        status: 'active',
        isPlatformTenant: true,
        websiteUrl: 'https://www.glossbossatx.com',
        onboardingStep: 0,
        onboardingCompletedAt: null,
      };
    }
    return null;
  }
  return mapBusiness(data as Record<string, unknown>);
}

export async function resolveBusinessContext(
  admin: SupabaseClient,
  opts?: { businessId?: string; workspaceKey?: string },
): Promise<BusinessContext | null> {
  const session = await getSessionWithProfile();
  if (!session.user) return null;

  let business: BusinessRecord | null = null;
  let memberRole: BusinessContext['memberRole'] = 'member';

  if (opts?.businessId) {
    business = await loadBusinessById(admin, opts.businessId);
  } else if (opts?.workspaceKey) {
    business = await loadBusinessByWorkspaceKey(admin, opts.workspaceKey);
  } else if (isStaffRole(session.profile?.role)) {
    business = await loadBusinessByWorkspaceKey(admin, DEFAULT_WORKSPACE_KEY);
    memberRole = 'staff';
  } else {
    const { data: membership } = await admin
      .from('business_members')
      .select('role, business_id, businesses(*)')
      .eq('user_id', session.user.id)
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (membership) {
      const m = membership as Record<string, unknown>;
      const biz = m.businesses as Record<string, unknown> | null;
      if (biz) business = mapBusiness(biz);
      memberRole = (str(m.role) || 'member') as BusinessContext['memberRole'];
    }
  }

  if (!business) {
    if (isStaffRole(session.profile?.role)) {
      business = await loadBusinessByWorkspaceKey(admin, DEFAULT_WORKSPACE_KEY);
      memberRole = 'staff';
    } else {
      return null;
    }
  }

  if (!business) return null;

  return {
    businessId: business.id,
    workspaceKey: business.workspaceKey,
    business,
    memberRole,
  };
}

export async function resolveDefaultBusinessContext(admin: SupabaseClient): Promise<BusinessContext> {
  const business = (await loadBusinessByWorkspaceKey(admin, DEFAULT_WORKSPACE_KEY))!;
  return {
    businessId: business.id,
    workspaceKey: business.workspaceKey,
    business,
    memberRole: 'staff',
  };
}

export async function createBusinessForUser(
  admin: SupabaseClient,
  input: {
    userId: string;
    name: string;
    slug: string;
    industry: string;
    websiteUrl?: string;
  },
): Promise<{ ok: boolean; businessId?: string; error?: string }> {
  const workspaceKey = `biz_${input.slug.replace(/[^a-z0-9]+/gi, '_').toLowerCase().slice(0, 40)}_${Date.now().toString(36)}`;
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from('businesses')
    .insert({
      workspace_key: workspaceKey,
      slug: input.slug,
      name: input.name,
      industry: input.industry,
      website_url: input.websiteUrl ?? null,
      onboarding_step: 1,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  const businessId = str((data as { id?: string }).id);

  await admin.from('business_members').insert({
    business_id: businessId,
    user_id: input.userId,
    role: 'owner',
    joined_at: now,
  });

  await seedDefaultFollowUpSequence(admin, businessId);

  return { ok: true, businessId };
}

export async function seedDefaultFollowUpSequence(admin: SupabaseClient, businessId: string): Promise<void> {
  const { data: seq } = await admin
    .from('titan_followup_sequences')
    .insert({ business_id: businessId, name: 'Standard outreach (Day 0 / 2 / 7 / 14)', is_default: true, snooze_days: 60 })
    .select('id')
    .single();

  const sequenceId = str((seq as { id?: string } | null)?.id);
  if (!sequenceId) return;

  const steps = [
    { step_order: 0, delay_days: 0, label: 'Day 0 — First pitch', channel: 'any' },
    { step_order: 1, delay_days: 2, label: 'Day 2 — Follow-up', channel: 'sms' },
    { step_order: 2, delay_days: 7, label: 'Day 7 — Value follow-up', channel: 'sms' },
    { step_order: 3, delay_days: 14, label: 'Day 14 — Final check-in', channel: 'sms' },
  ];

  for (const s of steps) {
    await admin.from('titan_followup_steps').insert({
      sequence_id: sequenceId,
      step_order: s.step_order,
      delay_days: s.delay_days,
      label: s.label,
      channel: s.channel,
      sms_template: 'Hi {{contact}} — {{business}} here. {{pitch}}',
      email_subject: '{{business}} follow-up',
      email_body: 'Hi {{contact}},\n\n{{pitch}}\n\n— {{business}}',
      call_script: 'Following up from {{business}} — do you have a moment?',
    });
  }
}
