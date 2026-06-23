/** Action outcome types — Titan learns from these. */

export const ACTION_OUTCOMES = [
  'no_response',
  'replied',
  'asked_price',
  'booked',
  'declined',
  'rescheduled',
  'became_customer',
  'revenue_collected',
  'ignored',
] as const;

export type ActionOutcome = (typeof ACTION_OUTCOMES)[number];

export const OUTCOME_LABELS: Record<ActionOutcome, string> = {
  no_response: 'No response',
  replied: 'They replied',
  asked_price: 'Asked price',
  booked: 'Booked',
  declined: 'Declined',
  rescheduled: 'Rescheduled',
  became_customer: 'Became customer',
  revenue_collected: 'Revenue collected',
  ignored: 'Ignored',
};

export type OutcomeRecord = {
  actionId: string;
  title: string;
  outcome: ActionOutcome | null;
  outcomeNotes: string | null;
  outcomeAt: string | null;
  attributedRevenueCents: number;
  status: string;
};

export type LearningInsight = {
  id: string;
  category: string;
  insight: string;
  confidencePercent: number;
};
