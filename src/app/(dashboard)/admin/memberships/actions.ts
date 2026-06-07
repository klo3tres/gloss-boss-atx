'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { slugify } from '@/lib/slugify';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

function str(v: FormDataEntryValue | null) {
  return v == null ? '' : String(v).trim();
}

async function gate() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return null;
  return { admin, userId: session.user.id };
}

export async function saveMembershipPlanAction(formData: FormData) {
  const g = await gate();
  if (!g) return;
  const id = str(formData.get('id'));
  const name = str(formData.get('name'));
  if (!name) return;
  const patch = {
    name,
    slug: str(formData.get('slug')) || slugify(name),
    tier: str(formData.get('tier')) || name.toLowerCase(),
    price_cents: Math.round(Number(str(formData.get('price'))) * 100) || 0,
    billing_interval: str(formData.get('billing_interval')) || 'monthly',
    benefits: str(formData.get('benefits')).split('\n').map((s) => s.trim()).filter(Boolean),
    included_services: str(formData.get('included_services')).split('\n').map((s) => s.trim()).filter(Boolean),
    discount_percent: Number(str(formData.get('discount_percent'))) || 0,
    show_on_homepage: formData.get('show_on_homepage') === 'on',
    show_on_services: formData.get('show_on_services') === 'on',
    archived: formData.get('archived') === 'on',
    updated_at: new Date().toISOString(),
  };
  if (id) await g.admin.from('membership_plans').update(patch).eq('id', id);
  else await g.admin.from('membership_plans').insert(patch);
  revalidatePath('/admin/memberships');
}

export async function saveLoyaltyRuleAction(formData: FormData) {
  const g = await gate();
  if (!g) return;
  const id = str(formData.get('id'));
  const patch = {
    name: str(formData.get('name')) || 'Punch card reward',
    rule_type: 'punch_card',
    services_required: Number(str(formData.get('services_required'))) || 5,
    reward_description: str(formData.get('reward_description')) || 'Complete 5 services, unlock 6th wash/free reward.',
    active: formData.get('active') === 'on',
    updated_at: new Date().toISOString(),
  };
  if (id) await g.admin.from('loyalty_rules').update(patch).eq('id', id);
  else await g.admin.from('loyalty_rules').insert(patch);
  revalidatePath('/admin/memberships');
}

export async function assignCustomerMembershipAction(formData: FormData) {
  const g = await gate();
  if (!g) return;
  const customerId = str(formData.get('customer_id'));
  const membershipPlanId = str(formData.get('membership_plan_id'));
  if (!customerId || !membershipPlanId) return;
  await g.admin.from('customer_memberships').insert({
    customer_id: customerId,
    membership_plan_id: membershipPlanId,
    status: 'active',
    assigned_by: g.userId,
    notes: str(formData.get('notes')) || null,
  });
  revalidatePath('/admin/memberships');
}
