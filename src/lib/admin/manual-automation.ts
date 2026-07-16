import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { runTrackedAutomation, type AutomationRunResult } from '@/lib/titan/automation-run';
import { MANUAL_AUTOMATIONS, type ManualAutomationKey } from '@/lib/admin/manual-automation-definitions';

export function isManualAutomationKey(value: string): value is ManualAutomationKey {
  return MANUAL_AUTOMATIONS.some((item) => item.key === value);
}

export type { ManualAutomationKey } from '@/lib/admin/manual-automation-definitions';

/**
 * Temporary owner-controlled scheduler abstraction. These jobs are manually runnable because
 * Vercel Hobby blocks frequent cron jobs. The automation business logic remains in its original
 * engines so a dedicated scheduler (or Vercel Pro) can call the same functions later.
 */
export async function runManualAutomation(
  admin: SupabaseClient,
  key: ManualAutomationKey,
): Promise<AutomationRunResult<unknown>> {
  return runTrackedAutomation(admin, key, 'manual', async () => {
    switch (key) {
      case 'follow_up_engine': {
        const { runFollowUpEngine } = await import('@/lib/follow-up-engine');
        return runFollowUpEngine(admin);
      }
      case 'notification_engine': {
        const { processDueScheduledMessages } = await import('@/lib/customer-notification-cadence');
        return processDueScheduledMessages(admin);
      }
      case 'review_request_engine':
      case 'payment_reminder_engine':
      case 'titan_daily_actions': {
        const { buildDailyActionPlan } = await import('@/lib/titan/daily-action-plan');
        const plan = await buildDailyActionPlan(admin);
        return { actionsPrepared: plan.actions.length, actionTypes: plan.actions.map((action) => action.actionType) };
      }
      case 'referral_engine': {
        const { loadReferralEngine } = await import('@/lib/titan/engines/referral');
        const result = await loadReferralEngine(admin);
        return { candidatesPrepared: result.candidates.length, autoPipelineEnabled: result.autoPipelineEnabled };
      }
      case 'weather_campaign_engine': {
        const { createWeatherCampaignDraft } = await import('@/lib/titan/weather-campaign-engine');
        return createWeatherCampaignDraft(admin);
      }
      case 'opportunity_follow_up_engine': {
        const { processOpportunityFollowUps } = await import('@/lib/opportunity-follow-up-cron');
        return processOpportunityFollowUps(admin);
      }
      case 'appointment_reminder_engine': {
        const { processAppointmentReminders } = await import('@/lib/customer-notification-cadence');
        return processAppointmentReminders(admin);
      }
      case 'missed_job_start_alerts': {
        const { processAppointmentOperationalAlerts, processMissedJobStartAlerts } = await import('@/lib/staff-notification-router');
        const [late, operational] = await Promise.all([
          processMissedJobStartAlerts(admin),
          processAppointmentOperationalAlerts(admin),
        ]);
        return {
          alerted: late.alerted + operational.alerted,
          skipped: late.skipped + operational.skipped,
          failed: late.failed + operational.failed,
        };
      }
    }
  });
}
