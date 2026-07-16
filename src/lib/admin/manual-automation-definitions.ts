export const MANUAL_AUTOMATIONS = [
  { key: 'follow_up_engine', label: 'Follow-up engine', description: 'Sync and deliver due customer follow-ups.' },
  { key: 'notification_engine', label: 'Notification engine', description: 'Deliver due queued customer and staff notifications.' },
  { key: 'review_request_engine', label: 'Review request engine', description: 'Refresh review-request actions for completed jobs.' },
  { key: 'referral_engine', label: 'Referral engine', description: 'Refresh post-service referral candidates and next actions.' },
  { key: 'weather_campaign_engine', label: 'Weather campaign engine', description: 'Analyze the forecast and prepare an owner-review draft only.' },
  { key: 'opportunity_follow_up_engine', label: 'Opportunity follow-up engine', description: 'Process due, consent-safe opportunity follow-ups.' },
  { key: 'titan_daily_actions', label: 'Titan Daily Actions', description: 'Rebuild today\'s prioritized Titan action plan.' },
  { key: 'appointment_reminder_engine', label: 'Appointment reminder engine', description: 'Process the 24-hour appointment reminder window.' },
  { key: 'missed_job_start_alerts', label: 'Missed job start alerts', description: 'Notify staff about appointments that have not started on time.' },
  { key: 'payment_reminder_engine', label: 'Payment reminder engine', description: 'Refresh payment-recovery actions for unpaid work orders.' },
] as const;

export type ManualAutomationKey = (typeof MANUAL_AUTOMATIONS)[number]['key'];
