'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { logTitanActivity } from '@/lib/titan/activity-feed';
import { sendPreviewedEmailAction, sendPreviewedSmsAction } from '@/app/(dashboard)/admin/outbound-message-actions';
import { updateOpportunityStatus } from '@/lib/titan/revenue-opportunities';

async function gate() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return null;
  return { admin, userId: session.user.id };
}

export async function createFleetQuoteAction(input: {
  opportunityId?: string;
  businessName?: string;
  contactName?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  vehicleCount: number;
  fleetSize: string;
  frequency: string;
  serviceSlug: string;
  perVehicleCents: number;
  address?: string;
  notes?: string;
  waterPower?: string;
  timeWindow?: string;
  depositPercent?: number;
  sendChannel?: 'sms' | 'email';
  sendBody?: string;
  sendSubject?: string;
  sendTo?: string;
}): Promise<{ ok?: boolean; error?: string; estimateId?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };

  const totalCents = input.perVehicleCents * Math.max(1, input.vehicleCount);
  const now = new Date().toISOString();
  const token = crypto.randomUUID().replace(/-/g, '');

  const row: Record<string, unknown> = {
    contact_name: input.contactName ?? input.businessName ?? 'Fleet contact',
    contact_email: input.contactEmail ?? null,
    contact_phone: input.contactPhone ?? null,
    service_slug: input.serviceSlug,
    vehicle_class: 'fleet',
    total_cents: totalCents,
    duration_minutes: 60 * Math.max(1, input.vehicleCount),
    status: 'draft',
    public_token: token,
    notes: [
      input.notes,
      `Fleet: ${input.vehicleCount} vehicles`,
      `Size tier: ${input.fleetSize}`,
      `Frequency: ${input.frequency}`,
      `Per vehicle: $${(input.perVehicleCents / 100).toFixed(2)}`,
      input.address ? `Address: ${input.address}` : '',
      input.waterPower ? `Water/power: ${input.waterPower}` : '',
      input.timeWindow ? `Window: ${input.timeWindow}` : '',
      input.depositPercent != null ? `Deposit: ${input.depositPercent}%` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    metadata: {
      fleet_size: input.fleetSize,
      vehicle_count: input.vehicleCount,
      frequency: input.frequency,
      per_vehicle_cents: input.perVehicleCents,
      business_name: input.businessName,
    },
    created_at: now,
    updated_at: now,
  };

  if (input.opportunityId) row.opportunity_id = input.opportunityId;

  const { data, error } = await g.admin.from('service_estimates').insert(row).select('id').maybeSingle();
  if (error) return { error: error.message };

  const estimateId = data?.id ? String(data.id) : undefined;

  if (input.opportunityId) {
    await updateOpportunityStatus(g.admin, input.opportunityId, 'quoted', 'Fleet quote created');
  }

  if (input.sendChannel && input.sendTo && input.sendBody) {
    const sendRes =
      input.sendChannel === 'sms'
        ? await sendPreviewedSmsAction({
            to: input.sendTo,
            body: input.sendBody,
            kind: 'fleet_quote',
            templateKey: 'fleet_quote',
            entityType: 'estimate',
            entityId: estimateId,
          })
        : await sendPreviewedEmailAction({
            to: input.sendTo,
            subject: input.sendSubject ?? `Fleet quote — ${input.businessName ?? 'Gloss Boss ATX'}`,
            body: input.sendBody,
            kind: 'fleet_quote',
            entityType: 'estimate',
            entityId: estimateId,
          });
    if (sendRes.error) return { error: sendRes.error, estimateId };
    if (estimateId) {
      await g.admin.from('service_estimates').update({ status: 'sent', sent_at: now }).eq('id', estimateId);
    }
  }

  await logTitanActivity(g.admin, {
    kind: 'outreach_sent',
    title: `Fleet quote: ${input.businessName ?? 'prospect'}`,
    detail: `${input.vehicleCount} vehicles · ${input.frequency}`,
    href: '/admin/titan/opportunities',
    metadata: { estimate_id: estimateId, opportunity_id: input.opportunityId },
  });

  revalidatePath('/admin/titan/opportunities');
  return { ok: true, estimateId };
}
