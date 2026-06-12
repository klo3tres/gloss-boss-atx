'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { actionErr, actionOk, type ActionResult } from '@/lib/action-result';
import { sendCustomerSms } from '@/lib/sms-send';
import { businessNotifyDestination, resendConfigured, sendResendHtml } from '@/lib/email-send';
import { resolveOrderLedger } from '@/lib/order-ledger';
import { recordJobTimelineEvent } from '@/lib/job-timeline-server';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

async function notifyOwnerCreditEvent(
  db: any,
  params: {
    kind: 'credit_issued' | 'reward_redeemed' | 'credit_redeemed';
    subject: string;
    headline: string;
    customerName?: string | null;
    customerEmail?: string | null;
    amountCents: number;
    creditId?: string | null;
    workOrderId?: string | null;
    reason?: string | null;
  },
) {
  const to = businessNotifyDestination();
  const amount = (params.amountCents / 100).toFixed(2);
  const payload = {
    to,
    customerName: params.customerName ?? 'Customer',
    customerEmail: params.customerEmail ?? null,
    amount_cents: params.amountCents,
    credit_id: params.creditId ?? null,
    work_order_id: params.workOrderId ?? null,
    reason: params.reason ?? null,
  };

  const record = async (status: string, extra: Record<string, unknown> = {}) => {
    try {
      await db.from('notification_outbox').insert({
        kind: params.kind,
        channel: 'email',
        status,
        provider: 'resend',
        template_key: params.kind,
        payload: { ...payload, ...extra },
      });
    } catch (e) {
      console.warn('[owner-credit-notify] outbox', e);
    }
  };

  if (!resendConfigured()) {
    await record('skipped', { skipped_reason: 'resend_not_configured' });
    return;
  }

  const html = `
    <div style="font-family:Arial,sans-serif;background:#050505;color:#fff;padding:24px;border:1px solid #d4af37;border-radius:14px">
      <p style="margin:0 0 8px;color:#d4af37;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.16em">Gloss Boss ATX owner alert</p>
      <h2 style="margin:0 0 14px;font-size:24px">${params.headline}</h2>
      <p style="margin:0 0 10px"><strong>Customer:</strong> ${payload.customerName}</p>
      ${payload.customerEmail ? `<p style="margin:0 0 10px"><strong>Email:</strong> ${payload.customerEmail}</p>` : ''}
      <p style="margin:0 0 10px"><strong>Amount:</strong> $${amount}</p>
      ${params.reason ? `<p style="margin:0 0 10px"><strong>Reason:</strong> ${params.reason}</p>` : ''}
      ${params.workOrderId ? `<p style="margin:0;color:#aaa"><strong>Work order:</strong> ${params.workOrderId}</p>` : ''}
    </div>
  `;
  const sent = await sendResendHtml({ to, subject: params.subject, html });
  await record(sent.ok ? 'sent' : 'failed', sent.ok ? { provider_message_id: sent.emailId ?? null } : { error_message: sent.error ?? 'send failed' });
}

async function requireAdminGate() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();
  const isStaff = ['admin', 'super_admin', 'technician'].includes(session.profile?.role ?? '');
  if (!session.supabaseConfigured || !supabase || !session.user || !isStaff) {
    return { ok: false as const, supabase: null, session: null };
  }
  return { ok: true as const, supabase, session };
}

export async function issueCreditAction(formData: FormData): Promise<ActionResult> {
  const gate = await requireAdminGate();
  if (!gate.ok) return actionErr('Not authorized.');

  const userId = gate.session?.user?.id;
  if (!userId) return actionErr('Not authorized.');

  const admin = tryCreateAdminSupabase();
  const db = admin ?? gate.supabase;

  const customerId = str(formData.get('customerId'));
  const amountDollars = Number(str(formData.get('amountDollars')));
  const type = str(formData.get('type')) || 'manual';
  const reason = str(formData.get('reason')) || 'Manual owner credit';
  const expiresAt = str(formData.get('expiresAt')) || null;
  const linkedWorkOrderId = str(formData.get('linkedWorkOrderId')) || null;
  const periodStart = str(formData.get('periodStart')) || null;
  const periodEnd = str(formData.get('periodEnd')) || null;

  if (!customerId) return actionErr('Missing customer ID.');
  if (isNaN(amountDollars) || amountDollars <= 0) return actionErr('Invalid credit amount.');

  const amountCents = Math.round(amountDollars * 100);

  // De-duplication check for membership credits
  if (type === 'membership' && periodStart && periodEnd) {
    const { data: dup } = await db
      .from('customer_credits')
      .select('id')
      .eq('customer_id', customerId)
      .eq('type', 'membership')
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd)
      .neq('status', 'voided')
      .maybeSingle();

    if (dup) {
      return actionErr('Membership credit already issued for this billing period.');
    }
  }

  const expiresTimestamp = expiresAt ? new Date(expiresAt).toISOString() : null;

  const { data: inserted, error: insertErr } = await db
    .from('customer_credits')
    .insert({
      customer_id: customerId,
      amount_cents: amountCents,
      remaining_cents: amountCents,
      type,
      reason,
      source: 'admin_manual',
      issued_by: userId,
      expires_at: expiresTimestamp,
      status: 'active',
      linked_work_order_id: linkedWorkOrderId,
      period_start: periodStart ? new Date(periodStart).toISOString() : null,
      period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
    })
    .select('*')
    .maybeSingle();

  if (insertErr || !inserted) {
    console.error('[CREDITS_ERROR]', insertErr);
    return actionErr(insertErr?.message || 'Failed to issue credit.');
  }

  // Fetch customer details to dispatch notifications
  const { data: customer } = await db.from('customers').select('*').eq('id', customerId).maybeSingle();
  const formattedAmount = amountDollars.toFixed(2);
  if (customer) {
    const name = String(customer.full_name || 'Valued Client');

    // 1. Send SMS if opted in
    if (customer.phone && (customer.sms_consent === true || customer.sms_status === 'opted_in')) {
      const smsBody = `Gloss Boss ATX: We have issued a $${formattedAmount} credit to your account. Reason: ${reason}. This will apply to your next service balance.`;
      await sendCustomerSms({
        db,
        kind: 'credit_issued',
        to: customer.phone,
        body: smsBody,
        customer_id: customerId,
        requireConsent: false,
      });
    }

    // 2. Send Email if email exists
    if (customer.email && customer.email.includes('@')) {
      const emailHtml = `
        <div style="font-family: sans-serif; background-color: #000; color: #fff; padding: 24px; border-radius: 12px; border: 1px solid #d4af37; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #d4af37; font-size: 24px; border-bottom: 1px solid #d4af37; padding-bottom: 12px; margin-top: 0;">Gloss Boss ATX</h2>
          <p>Hello ${name},</p>
          <p>A credit has been issued to your account:</p>
          <div style="border: 1px solid #3f3f46; border-radius: 8px; padding: 16px; background-color: #18181b; margin: 16px 0;">
            <p style="margin: 0; font-size: 20px; color: #fcd34d;"><strong>Amount: $${formattedAmount}</strong></p>
            <p style="margin: 8px 0 0; color: #a1a1aa; font-size: 14px;"><strong>Reason:</strong> ${reason}</p>
            ${expiresTimestamp ? `<p style="margin: 8px 0 0; color: #a1a1aa; font-size: 14px;"><strong>Expires:</strong> ${new Date(expiresTimestamp).toLocaleDateString()}</p>` : ''}
          </div>
          <p style="color: #a1a1aa; font-size: 14px; line-height: 1.5;">This credit will automatically apply to your next completed service balance due.</p>
          <p style="color: #71717a; font-size: 12px; margin-top: 24px; border-top: 1px solid #27272a; padding-top: 12px;">Thank you for choosing Gloss Boss ATX!</p>
        </div>
      `;
      await sendResendHtml({
        to: customer.email,
        subject: `Gloss Boss ATX — $${formattedAmount} Credit Issued`,
        html: emailHtml,
      });
    }

    // Log internal note
    await db.from('customer_notes').insert({
      customer_id: customerId,
      body: `Issued $${formattedAmount} credit (${type}). Reason: ${reason}.`,
    });
  }

  await notifyOwnerCreditEvent(db, {
    kind: 'credit_issued',
    subject: `Gloss Boss ATX — Credit issued: $${formattedAmount}`,
    headline: 'Customer credit issued',
    customerName: customer ? (customer.full_name || customer.name || customer.email) : 'Customer',
    customerEmail: customer?.email ?? null,
    amountCents,
    creditId: inserted.id,
    workOrderId: linkedWorkOrderId,
    reason,
  });

  revalidatePath('/admin/customers');
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath('/admin/memberships');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/reports');
  revalidatePath('/admin');
  return actionOk('Credit issued successfully.');
}

export async function voidCreditAction(formData: FormData): Promise<ActionResult> {
  const gate = await requireAdminGate();
  if (!gate.ok) return actionErr('Not authorized.');

  const admin = tryCreateAdminSupabase();
  const db = admin ?? gate.supabase;

  const creditId = str(formData.get('creditId'));
  if (!creditId) return actionErr('Missing credit ID.');

  const { data: credit } = await db.from('customer_credits').select('*').eq('id', creditId).maybeSingle();
  if (!credit) return actionErr('Credit not found.');

  const { error: voidErr } = await db
    .from('customer_credits')
    .update({
      status: 'voided',
      remaining_cents: 0,
      reason: `Voided: ${credit.reason}`,
    })
    .eq('id', creditId);

  if (voidErr) {
    return actionErr(voidErr.message);
  }

  await db.from('customer_notes').insert({
    customer_id: credit.customer_id,
    body: `Voided credit ID ${creditId.slice(0, 8)}… of amount $${(credit.amount_cents / 100).toFixed(2)}.`,
  });

  revalidatePath('/admin/customers');
  revalidatePath(`/admin/customers/${credit.customer_id}`);
  revalidatePath('/admin/memberships');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/reports');
  revalidatePath('/admin');
  return actionOk('Credit voided successfully.');
}

export async function clearTestCreditsAction(formData: FormData): Promise<ActionResult> {
  const gate = await requireAdminGate();
  if (!gate.ok) return actionErr('Not authorized.');

  const admin = tryCreateAdminSupabase();
  const db = admin ?? gate.supabase;
  const customerId = str(formData.get('customerId'));
  if (!customerId) return actionErr('Missing customer ID.');

  const { data: credits, error: loadErr } = await db
    .from('customer_credits')
    .select('*')
    .eq('customer_id', customerId)
    .in('status', ['active', 'partially_used']);
  if (loadErr) return actionErr(loadErr.message);

  const testCredits = ((credits ?? []) as Array<Record<string, unknown>>).filter((c) => {
    const haystack = `${str(c.reason)} ${str(c.type)} ${str(c.source)}`.toLowerCase();
    return haystack.includes('test') || haystack.includes('qa') || haystack.includes('demo');
  });
  if (testCredits.length === 0) return actionOk('No active test credits found for this customer.');

  const ids = testCredits.map((c) => str(c.id)).filter(Boolean);
  const { error } = await db
    .from('customer_credits')
    .update({ status: 'voided', remaining_cents: 0, reason: 'Voided test credit cleanup' })
    .in('id', ids);
  if (error) return actionErr(error.message);

  await db.from('customer_notes').insert({
    customer_id: customerId,
    body: `Cleared ${ids.length} active test/QA/demo credit(s).`,
  });

  revalidatePath('/admin/customers');
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath('/admin/memberships');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/reports');
  revalidatePath('/admin');
  return actionOk(`Cleared ${ids.length} test credit(s).`);
}

export async function applyCreditToWorkOrderAction(formData: FormData): Promise<ActionResult> {
  const gate = await requireAdminGate();
  if (!gate.ok) return actionErr('Not authorized.');

  const userId = gate.session?.user?.id;
  if (!userId) return actionErr('Not authorized.');

  const admin = tryCreateAdminSupabase();
  const db = admin ?? gate.supabase;

  const customerId = str(formData.get('customerId'));
  const creditId = str(formData.get('creditId'));
  const workOrderId = str(formData.get('workOrderId'));
  const amountDollars = Number(str(formData.get('amountDollars')));
  const source = str(formData.get('source')) === 'fallback' ? 'fallback' : 'appointment';

  if (!customerId || !creditId || !workOrderId) {
    return actionErr('Missing customer, credit, or work order information.');
  }

  if (isNaN(amountDollars) || amountDollars <= 0) {
    return actionErr('Invalid amount to apply.');
  }

  // Transactional balance checking
  const { data: credit } = await db
    .from('customer_credits')
    .select('*')
    .eq('id', creditId)
    .maybeSingle();

  if (!credit || credit.status === 'used' || credit.status === 'voided') {
    return actionErr('This credit is no longer active.');
  }

  if (credit.remaining_cents <= 0) {
    return actionErr('This credit has no remaining balance.');
  }

  const ledger = await resolveOrderLedger(db, {
    workOrderId,
    appointmentId: source === 'appointment' ? workOrderId : undefined,
    fallbackBookingId: source === 'fallback' ? workOrderId : undefined,
  });

  if (!ledger) {
    return actionErr('Could not resolve order ledger.');
  }

  const currentBalanceCents = ledger.totals.balanceDueCents;
  if (currentBalanceCents <= 0) {
    return actionErr('This work order already has a zero balance due.');
  }

  const requestedCents = Math.round(amountDollars * 100);
  const centsToApply = Math.min(requestedCents, credit.remaining_cents, currentBalanceCents);

  if (centsToApply <= 0) {
    return actionErr('Nothing to apply.');
  }

  // Deduct credit
  const remainingCents = credit.remaining_cents - centsToApply;
  const newStatus = remainingCents === 0 ? 'used' : 'partially_used';

  const { error: creditUpdateErr } = await db
    .from('customer_credits')
    .update({
      remaining_cents: remainingCents,
      status: newStatus,
      redeemed_at: remainingCents === 0 ? new Date().toISOString() : null,
    })
    .eq('id', creditId);

  if (creditUpdateErr) {
    return actionErr('Failed to update credit row.');
  }

  // Create payment record
  const paymentPayload: any = {
    amount_cents: centsToApply,
    currency: 'usd',
    status: 'succeeded',
    customer_id: customerId,
    payment_kind: 'credit_redemption',
    provider: 'customer_credit',
    paid_at: new Date().toISOString(),
    metadata: {
      customer_credit_id: creditId,
      reason: `Applied customer credit: ${credit.reason}`,
    },
  };

  if (source === 'appointment') {
    paymentPayload.appointment_id = workOrderId;
  } else {
    paymentPayload.fallback_booking_id = workOrderId;
  }

  const { data: paymentRow, error: paymentErr } = await db
    .from('payments')
    .insert(paymentPayload)
    .select('*')
    .maybeSingle();

  if (paymentErr || !paymentRow) {
    // Rollback credit change if payment failed (best effort)
    await db
      .from('customer_credits')
      .update({
        remaining_cents: credit.remaining_cents,
        status: credit.status,
        redeemed_at: credit.redeemed_at,
      })
      .eq('id', creditId);
    return actionErr(paymentErr?.message || 'Failed to record payment row.');
  }

  // Insert redemption record
  await db.from('customer_credit_redemptions').insert({
    credit_id: creditId,
    payment_id: paymentRow.id,
    amount_cents: centsToApply,
    redeemed_at: new Date().toISOString(),
    redeemed_by: userId,
  });

  // Re-generate receipt draft so the totals update cleanly
  const { upsertWorkOrderReceipt } = await import('@/app/(dashboard)/tech/work-order-payment-actions');
  await upsertWorkOrderReceipt(db, workOrderId, source === 'appointment' ? workOrderId : '', source === 'fallback' ? workOrderId : '', ledger._job);

  // Write timeline event
  if (source === 'appointment') {
    await recordJobTimelineEvent(db, {
      appointmentId: workOrderId,
      eventType: 'payment_received',
      meta: {
        amount_cents: centsToApply,
        payment_method: 'credit',
        credit_id: creditId,
        reason: `Applied customer credit`,
      },
      createdBy: userId,
    });
  }

  // Log customer note
  await db.from('customer_notes').insert({
    customer_id: customerId,
    body: `Redeemed $${(centsToApply / 100).toFixed(2)} credit from credit ID ${creditId.slice(0, 8)}… to work order ${workOrderId.slice(0, 8)}….`,
  });

  const { data: ownerCustomer } = await db.from('customers').select('full_name, name, email').eq('id', customerId).maybeSingle();
  await notifyOwnerCreditEvent(db, {
    kind: 'credit_redeemed',
    subject: `Gloss Boss ATX — Credit redeemed: $${(centsToApply / 100).toFixed(2)}`,
    headline: 'Customer credit redeemed',
    customerName: ownerCustomer ? (ownerCustomer.full_name || ownerCustomer.name || ownerCustomer.email) : 'Customer',
    customerEmail: ownerCustomer?.email ?? null,
    amountCents: centsToApply,
    creditId,
    workOrderId,
    reason: `Applied customer credit to ${source} work order`,
  });

  revalidatePath('/admin/customers');
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath(`/tech/work-orders/${workOrderId}`);
  revalidatePath(`/admin/work-orders/${workOrderId}`);
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/reports');
  revalidatePath('/admin');
  return actionOk(`Applied $${(centsToApply / 100).toFixed(2)} credit successfully.`);
}
