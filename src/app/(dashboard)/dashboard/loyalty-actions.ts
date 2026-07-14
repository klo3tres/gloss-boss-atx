'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { actionErr, actionOk, type ActionResult } from '@/lib/action-result';
import { sendCustomerSms } from '@/lib/sms-send';
import { sendResendHtml, resendConfigured, businessNotifyDestination } from '@/lib/email-send';
import {
  buildLoyaltyRewardView,
  countRedeemedLoyaltyRewards,
  loadLoyaltyRewardConfig,
} from '@/lib/loyalty-reward-claim';

export async function claimLoyaltyRewardAction(selectedServiceSlug?: string): Promise<ActionResult> {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  const email = session.user?.email?.trim().toLowerCase();
  if (!session.user || !email || !admin) return actionErr('Sign in to claim your reward.');

  const { data: customer } = await admin.from('customers').select('id, full_name, email, phone, sms_consent, sms_status').ilike('email', email).maybeSingle();
  if (!customer?.id) return actionErr('No customer profile found for this account.');

  const customerId = String(customer.id);
  const [{ data: stamps }, redeemedCount, rewardConfig] = await Promise.all([
    admin.from('loyalty_stamps').select('stamp_count, voided, voided_at').eq('customer_id', customerId),
    countRedeemedLoyaltyRewards(admin, customerId),
    loadLoyaltyRewardConfig(admin),
  ]);

  const view = buildLoyaltyRewardView(stamps ?? [], redeemedCount, { rewardThreshold: rewardConfig.rewardThreshold });
  if (!view.canClaim) return actionErr('No punch-card reward is available to claim right now.');

  const serviceBased = ['free_service', 'free_wash'].includes(rewardConfig.rewardType);
  let selectedServiceName = '';
  if (serviceBased) {
    const slug = String(selectedServiceSlug ?? rewardConfig.freeServiceSlug ?? '').trim();
    if (!slug) return actionErr('Choose an eligible service before claiming this reward.');
    if (rewardConfig.eligibleServiceSlugs.length > 0 && !rewardConfig.eligibleServiceSlugs.includes(slug)) {
      return actionErr('That service is not eligible for this reward.');
    }
    const service = await admin.from('services').select('slug, name, active').eq('slug', slug).eq('active', true).maybeSingle();
    if (!service.data) return actionErr('That service is no longer available. Choose another service.');
    selectedServiceName = String(service.data.name ?? slug);
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + rewardConfig.expirationDays);
  const rewardOrdinal = redeemedCount + 1;
  const source = `loyalty:${customerId}:${rewardOrdinal}`;
  const reason = selectedServiceName ? `${rewardConfig.rewardDescription} · Reserved: ${selectedServiceName}` : rewardConfig.rewardDescription;

  const { data: inserted, error } = await admin
    .from('customer_credits')
    .insert({
      customer_id: customerId,
      amount_cents: rewardConfig.rewardCents,
      remaining_cents: rewardConfig.rewardCents,
      type: 'loyalty_reward',
      reason,
      source,
      status: 'active',
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .maybeSingle();

  if (error || !inserted) {
    if (/duplicate|unique/i.test(error?.message ?? '')) return actionErr('This loyalty milestone was already claimed. Refresh to see it in your wallet.');
    return actionErr(error?.message ?? 'Could not issue reward credit.');
  }

  const amountLabel = `$${(rewardConfig.rewardCents / 100).toFixed(2)}`;
  const name = String(customer.full_name || 'Valued Client');

  if (customer.phone && (customer.sms_consent === true || customer.sms_status === 'opted_in')) {
    await sendCustomerSms({
      db: admin,
      kind: 'loyalty_reward_claimed',
      to: customer.phone,
      body: `Gloss Boss ATX: Your punch-card reward is ready! We added ${amountLabel} to your account. Book your next detail and credits apply automatically.`,
      customer_id: customerId,
      requireConsent: false,
    });
  }

  if (customer.email?.includes('@')) {
    await sendResendHtml({
      to: customer.email,
      subject: 'Gloss Boss ATX — Punch-card reward claimed',
      html: `<div style="font-family:sans-serif;background:#000;color:#fff;padding:24px;border:1px solid #d4af37;border-radius:12px"><h2 style="color:#d4af37">Reward claimed</h2><p>Hi ${name},</p><p>Your loyalty punch-card reward (${amountLabel}) is now on your account and will auto-apply when you book.</p></div>`,
    });
  }

  if (resendConfigured()) {
    const ownerTo = businessNotifyDestination();
    await sendResendHtml({
      to: ownerTo,
      subject: `Gloss Boss ATX — Loyalty reward claimed: ${name}`,
      html: `<div style="font-family:sans-serif;background:#050505;color:#fff;padding:24px;border:1px solid #d4af37"><p>${name} claimed a punch-card reward (${amountLabel}).</p></div>`,
    });
  }

  await admin.from('customer_notes').insert({
    customer_id: customerId,
    body: `Customer self-claimed punch-card reward (${amountLabel})${selectedServiceName ? ` and selected ${selectedServiceName}` : ''}.`,
  });

  revalidatePath('/dashboard');
  revalidatePath('/book');
  return actionOk(`Reward claimed! ${amountLabel} was added to your account and will apply at checkout.`);
}
