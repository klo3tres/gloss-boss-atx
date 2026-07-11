import {
  nextOpportunityFollowUpDate,
  OPPORTUNITY_SNOOZE_DAYS,
} from '@/lib/opportunity-pipeline-scripts';

/** Pure timing helpers — safe for client import paths (no SMS/email/web-push). */

export function initialOpportunityFollowUpAt(createdAt = new Date()): string {
  return nextOpportunityFollowUpDate(0, createdAt)?.toISOString() ?? createdAt.toISOString();
}

export function snoozeOpportunityFollowUpUntil(from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + OPPORTUNITY_SNOOZE_DAYS);
  return d.toISOString();
}
