export type AutomationMode = 'draft_only' | 'owner_approval' | 'automatic';

export type AutomationRecipientPreview = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  reason: string;
  blockedReason?: string | null;
  channel: string;
  quick: string;
  professional: string;
  warm: string;
};

export type AutomationPreview = {
  key: ManualAutomationKey;
  eligibleCount: number;
  blockedCount: number;
  recipients: AutomationRecipientPreview[];
  lastRunAt: string | null;
  lastResult: string;
  nextSuggestedRun: string;
};

export const MANUAL_AUTOMATIONS = [
  { key: 'follow_up_engine', label: 'Follow-up engine', purpose: 'Find past customers who are due for a personal check-in.', trigger: 'Customer reaches a configured 30, 60, or 90-day follow-up date.', recordsScanned: 'Completed appointments, follow-up queue, consent, and rebooking status.', draftsOnly: true, canContactCustomers: true, channels: ['SMS', 'Email'], mode: 'owner_approval' as AutomationMode, actionLabel: 'Preview follow-up recipients', safeguards: ['Exact recipient preview', 'Consent and STOP enforcement', 'Duplicate and rebooking suppression', 'Owner confirmation required'] },
  { key: 'notification_engine', label: 'Notification engine', purpose: 'Review customer and staff messages that have reached their due time.', trigger: 'A durable queued notification becomes due.', recordsScanned: 'Scheduled messages, appointment state, delivery status, and consent.', draftsOnly: true, canContactCustomers: true, channels: ['SMS', 'Email', 'Staff alert'], mode: 'owner_approval' as AutomationMode, actionLabel: 'Preview due notifications', safeguards: ['No delivery from this scan', 'Exact queued message shown', 'Quiet-hour and consent checks remain active'] },
  { key: 'review_request_engine', label: 'Review request engine', purpose: 'Find completed jobs that have not received a review request.', trigger: 'A paid/completed job has no review-request timestamp.', recordsScanned: 'Job closeouts, appointments, customer contact, and prior review requests.', draftsOnly: true, canContactCustomers: true, channels: ['SMS', 'Email'], mode: 'owner_approval' as AutomationMode, actionLabel: 'Preview eligible review requests', safeguards: ['Completed jobs only', 'No duplicate review request', 'Customer-facing copy only', 'Owner confirmation required'] },
  { key: 'referral_engine', label: 'Referral engine', purpose: 'Find satisfied customers ready for a referral invitation.', trigger: 'A completed customer reaches the configured post-service stage.', recordsScanned: 'Completed appointments, reviews, referral stage, and reward program.', draftsOnly: true, canContactCustomers: true, channels: ['SMS', 'Email'], mode: 'owner_approval' as AutomationMode, actionLabel: 'Find referral opportunities', safeguards: ['No automatic send', 'Configured reward language', 'One-to-one delivery only'] },
  { key: 'weather_campaign_engine', label: 'Weather campaign engine', purpose: 'Create a personalized campaign draft when the forecast creates a useful service window.', trigger: 'Rain recovery, dry window, heat, freeze, pollen, or cancellation-recovery signal.', recordsScanned: 'Forecast, appointment capacity, customer history, consent, cooldowns, and service fit.', draftsOnly: true, canContactCustomers: true, channels: ['SMS', 'Email', 'Social draft'], mode: 'owner_approval' as AutomationMode, actionLabel: 'Create weather campaign draft', safeguards: ['Draft only by default', 'Capacity required', 'Cooldown and opt-out enforcement', 'Deep-clean exclusions'] },
  { key: 'opportunity_follow_up_engine', label: 'Opportunity follow-up engine', purpose: 'Find open opportunities whose next follow-up date is due.', trigger: 'An open opportunity reaches its next follow-up time.', recordsScanned: 'Open Titan opportunities, cadence state, contact data, and prior touches.', draftsOnly: true, canContactCustomers: true, channels: ['SMS'], mode: 'owner_approval' as AutomationMode, actionLabel: 'Preview opportunity follow-ups', safeguards: ['First-party or business contacts only', 'No fabricated consumer contacts', 'No send from scan'] },
  { key: 'titan_daily_actions', label: 'Titan Daily Actions', purpose: 'Reconcile today’s action list against current revenue, customer, and job records.', trigger: 'First Titan visit each Chicago business day or owner refresh.', recordsScanned: 'Balances, completed jobs, opportunities, rebooking, membership, and calendar capacity.', draftsOnly: true, canContactCustomers: false, channels: ['Internal only'], mode: 'draft_only' as AutomationMode, actionLabel: 'Refresh Titan Daily Actions', safeguards: ['Once-per-day durable cache', 'Resolved items removed', 'No customer message sent'] },
  { key: 'appointment_reminder_engine', label: 'Appointment reminder engine', purpose: 'Find upcoming appointments that qualify for a reminder.', trigger: 'Appointment enters the configured reminder window.', recordsScanned: 'Upcoming appointments, contact information, status, and reminder history.', draftsOnly: true, canContactCustomers: true, channels: ['SMS'], mode: 'owner_approval' as AutomationMode, actionLabel: 'Generate reminder drafts', safeguards: ['No send from scan', 'Canceled/completed jobs excluded', 'Owner confirmation required'] },
  { key: 'missed_job_start_alerts', label: 'Missed job start alerts', purpose: 'Find appointments that have not started after the allowed grace period.', trigger: 'Scheduled start passes with no job-start timestamp.', recordsScanned: 'Today’s appointments, technician assignment, start state, and approved delays.', draftsOnly: false, canContactCustomers: false, channels: ['Staff alert'], mode: 'owner_approval' as AutomationMode, actionLabel: 'Scan for missed job starts', safeguards: ['Staff-only notifications', 'Flexible and approved delays excluded', 'Duplicate alerts suppressed'] },
  { key: 'payment_reminder_engine', label: 'Payment reminder engine', purpose: 'Find work orders with a real outstanding balance and prepare payment reminders.', trigger: 'Canonical work-order balance remains above zero.', recordsScanned: 'Appointments, canonical payments, balance, customer contact, and payment link state.', draftsOnly: true, canContactCustomers: true, channels: ['SMS', 'Email'], mode: 'owner_approval' as AutomationMode, actionLabel: 'Preview payment reminders', safeguards: ['Paid balances excluded', 'Exact amount shown', 'Secure payment link', 'Owner confirmation required'] },
] as const;

export type ManualAutomationKey = (typeof MANUAL_AUTOMATIONS)[number]['key'];

export function automationDefinition(key: ManualAutomationKey) {
  return MANUAL_AUTOMATIONS.find((automation) => automation.key === key)!;
}
