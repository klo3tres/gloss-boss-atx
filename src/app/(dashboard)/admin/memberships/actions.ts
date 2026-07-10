'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { slugify } from '@/lib/slugify';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

function str(v: FormDataEntryValue | null) {
  return v == null ? '' : String(v).trim();
}

const PUBLIC_TIERS = new Set(['bronze', 'silver', 'gold']);
const LOYALTY_CARD_BUCKET = 'loyalty-cards';
const LOYALTY_CARD_MAX_BYTES = 12 * 1024 * 1024;
const LOYALTY_CARD_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
  const tier = (str(formData.get('tier')) || name.toLowerCase()).toLowerCase();
  if (!id && !PUBLIC_TIERS.has(tier)) return;
  const patch = {
    name,
    slug: str(formData.get('slug')) || slugify(name),
    tier,
    price_cents: Math.round(Number(str(formData.get('price_monthly'))) * 100) || Math.round(Number(str(formData.get('price'))) * 100) || 0,
    price_weekly_cents: Math.round(Number(str(formData.get('price_weekly'))) * 100) || 0,
    price_biweekly_cents: Math.round(Number(str(formData.get('price_biweekly'))) * 100) || 0,
    price_monthly_cents: Math.round(Number(str(formData.get('price_monthly'))) * 100) || 0,
    price_yearly_cents: Math.round(Number(str(formData.get('price_yearly'))) * 100) || 0,
    billing_interval: str(formData.get('billing_interval')) || 'monthly',
    benefits: str(formData.get('benefits')).split('\n').map((s) => s.trim()).filter(Boolean),
    included_services: str(formData.get('included_services')).split('\n').map((s) => s.trim()).filter(Boolean),
    discount_percent: Number(str(formData.get('discount_percent'))) || 0,
    punch_multiplier: Number(str(formData.get('punch_multiplier')) || 1.0),
    bonus_punches: Number(str(formData.get('bonus_punches')) || 0),
    reward_threshold: Number(str(formData.get('reward_threshold')) || 5),
    reward_description: str(formData.get('reward_description')) || 'Complete 5 services, unlock 6th wash/free reward.',
    gold_60day_upgrade_credit_cents: Math.round(Number(str(formData.get('gold_60day_upgrade_credit'))) * 100) || 0,
    credit_expiration_months: Number(str(formData.get('credit_expiration_months'))) || 12,
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
  const rewardType = str(formData.get('reward_type')) || 'credit';
  const rewardCents = Math.max(0, Number(str(formData.get('reward_cents'))) || 7500);
  const freeServiceSlug = str(formData.get('free_service_slug')) || null;
  const rewardPayload: Record<string, unknown> = {
    reward_type: rewardType,
    reward_cents: rewardCents,
    credit_cents: rewardCents,
  };
  if (rewardType === 'free_service' && freeServiceSlug) {
    rewardPayload.free_service_slug = freeServiceSlug;
  }
  if (rewardType === 'free_wash') {
    rewardPayload.free_wash = true;
  }
  if (rewardType === 'upgrade') {
    rewardPayload.upgrade_credit_cents = rewardCents;
  }
  const patch = {
    name: str(formData.get('name')) || 'Punch card reward',
    rule_type: 'punch_card',
    services_required: Number(str(formData.get('services_required'))) || 5,
    reward_description: str(formData.get('reward_description')) || 'Complete 5 services, unlock 6th wash/free reward.',
    reward_payload: rewardPayload,
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

export async function saveLoyaltyCardDesignAction(formData: FormData): Promise<void> {
  const g = await gate();
  if (!g) return;

  const id = str(formData.get('id'));
  const name = str(formData.get('name')) || 'Loyalty Card Design';
  const tier = str(formData.get('tier')) || 'default';
  const active = formData.get('active') === 'on';
  const archived = formData.get('archived') === 'on';

  const frontFile = formData.get('frontImage');
  const backFile = formData.get('backImage');

  let front_image_url = str(formData.get('front_image_url_existing'));
  let front_image_path = str(formData.get('front_image_path_existing'));
  let back_image_url = str(formData.get('back_image_url_existing'));
  let back_image_path = str(formData.get('back_image_path_existing'));

  const ensureBucket = async () => {
    const existing = await g.admin.storage.getBucket(LOYALTY_CARD_BUCKET);
    if (!existing.error) return;

    const { error } = await g.admin.storage.createBucket(LOYALTY_CARD_BUCKET, {
      public: true,
      fileSizeLimit: LOYALTY_CARD_MAX_BYTES,
      allowedMimeTypes: LOYALTY_CARD_MIME_TYPES,
    });

    if (error && !/already exists/i.test(error.message)) {
      throw new Error(error.message);
    }
  };

  const uploadFile = async (file: FormDataEntryValue | null, suffix: string) => {
    if (file instanceof File && file.size > 0) {
      const mime = file.type || 'image/png';
      if (file.size > LOYALTY_CARD_MAX_BYTES) {
        throw new Error('Loyalty card image must be 12 MB or smaller.');
      }
      if (!LOYALTY_CARD_MIME_TYPES.includes(mime)) {
        throw new Error('Loyalty card image must be PNG, JPG, or WebP.');
      }
      await ensureBucket();
      const buf = Buffer.from(await file.arrayBuffer());
      const timestamp = Date.now();
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 50);
      const path = `${tier}/${timestamp}-${suffix}-${cleanName}`;
      
      const { error: upErr } = await g.admin.storage
        .from(LOYALTY_CARD_BUCKET)
        .upload(path, buf, { contentType: mime, upsert: true });

      if (upErr) throw new Error(upErr.message);

      const { data: pub } = g.admin.storage.from(LOYALTY_CARD_BUCKET).getPublicUrl(path);
      return { url: pub.publicUrl, path };
    }
    return null;
  };

  try {
    const frontRes = await uploadFile(frontFile, 'front');
    if (frontRes) {
      front_image_url = frontRes.url;
      front_image_path = frontRes.path;
    }

    const backRes = await uploadFile(backFile, 'back');
    if (backRes) {
      back_image_url = backRes.url;
      back_image_path = backRes.path;
    }

    const patch: any = {
      name,
      tier,
      front_image_url,
      front_image_path,
      back_image_url,
      back_image_path,
      active,
      archived,
      updated_at: new Date().toISOString(),
    };

    let targetId = id;
    if (id) {
      const { error } = await g.admin.from('loyalty_card_designs').update(patch).eq('id', id);
      if (error) throw error;
    } else {
      patch.created_by = g.userId;
      const { data, error } = await g.admin.from('loyalty_card_designs').insert(patch).select('id').maybeSingle();
      if (error) throw error;
      if (data?.id) targetId = data.id;
    }

    if (active && !archived && targetId) {
      const { error } = await g.admin
        .from('loyalty_card_designs')
        .update({ active: false })
        .eq('tier', tier)
        .neq('id', targetId);
      if (error) throw error;
    }

    revalidatePath('/admin/memberships');
    revalidatePath('/dashboard');
  } catch (err: any) {
    console.error('[saveLoyaltyCardDesignAction] error:', err);
  }
}
