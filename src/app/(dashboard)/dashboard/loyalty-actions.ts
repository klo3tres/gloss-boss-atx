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

export async function claimLoyaltyRewardAction(): Promise<ActionResult> {
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

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 12);

  const { data: inserted, error } = await admin
    .from('customer_credits')
    .insert({
      customer_id: customerId,
      amount_cents: rewardConfig.rewardCents,
      remaining_cents: rewardConfig.rewardCents,
      type: 'loyalty_reward',
      reason: rewardConfig.rewardDescription,
      source: 'loyalty_claim',
      status: 'active',
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .maybeSingle();

  if (error || !inserted) return actionErr(error?.message ?? 'Could not issue reward credit.');

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
    body: `Customer self-claimed punch-card reward credit (${amountLabel}).`,
  });

  revalidatePath('/dashboard');
  revalidatePath('/book');
  return actionOk(`Reward claimed! ${amountLabel} was added to your account and will apply at checkout.`);
}
