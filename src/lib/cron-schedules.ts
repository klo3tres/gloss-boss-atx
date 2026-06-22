/** Vercel Hobby-compatible cron schedules (once daily max). */

export const CRON_SCHEDULES = {
  titanNightly: '0 6 * * *',
  syncExceptions: '0 7 * * *',
  processFollowUps: '0 14 * * *',
} as const;

export const HOBBY_MODE_AUTOMATION_WARNING =
  'Running in Hobby Mode. High-frequency automation disabled.';

export const CRON_MANUAL_HINTS = {
  titanNightly: 'Titan Home or Command Center → Run Titan nightly',
  syncExceptions: 'Exception inbox → Sync now',
  processFollowUps: 'Follow-ups → Run engine now',
  leadRadar: 'Lead Radar → Run discovery now',
  opportunityScanner: 'Opportunity Scanner → paste & score manually',
} as const;
