export type TitanIntegrationType =
  | 'google_calendar'
  | 'gmail'
  | 'stripe'
  | 'twilio'
  | 'website_forms'
  | 'resend'
  | 'meta'
  | 'other';

export type IntegrationCardModel = {
  type: TitanIntegrationType;
  label: string;
  description: string;
  permissions: string[];
  connectPath?: string;
  docsHint?: string;
};

export const TITAN_INTEGRATION_CATALOG: IntegrationCardModel[] = [
  {
    type: 'google_calendar',
    label: 'Google Calendar',
    description: 'Sync appointments, block booking availability, and push job events.',
    permissions: ['calendar.events', 'userinfo.email'],
    connectPath: '/api/titan/integrations/google/connect?service=calendar',
  },
  {
    type: 'gmail',
    label: 'Gmail',
    description: 'Send and track outreach email from your connected inbox.',
    permissions: ['gmail.send', 'gmail.readonly', 'userinfo.email'],
    connectPath: '/api/titan/integrations/google/connect?service=gmail',
  },
  {
    type: 'stripe',
    label: 'Stripe',
    description: 'Payments, subscriptions, and revenue sync.',
    permissions: ['payments', 'customers', 'subscriptions'],
    docsHint: 'Configure STRIPE_SECRET_KEY and webhook in Gloss Boss admin or per-business Stripe Connect (coming soon).',
  },
  {
    type: 'twilio',
    label: 'Twilio SMS',
    description: 'Outbound SMS, reminders, and follow-up automation.',
    permissions: ['sms:send', 'sms:status'],
    docsHint: 'Platform Twilio credentials (TWILIO_*) or per-business subaccount (coming soon).',
  },
  {
    type: 'website_forms',
    label: 'Website Forms / API Key',
    description: 'POST leads from any website form to Titan via API key.',
    permissions: ['leads:write'],
    connectPath: '/titan/api-keys',
  },
  {
    type: 'resend',
    label: 'Resend Email',
    description: 'Transactional and marketing email delivery.',
    permissions: ['email:send'],
    docsHint: 'Uses RESEND_API_KEY at platform level today.',
  },
];

export type IndustryOpportunityType = {
  key: string;
  label: string;
  category: 'sales' | 'service' | 'retention' | 'project';
};

export const DETAILING_OPPORTUNITY_TYPES: IndustryOpportunityType[] = [
  { key: 'detailing_booking', label: 'Detailing booking', category: 'sales' },
  { key: 'fleet_quote', label: 'Fleet quote', category: 'sales' },
  { key: 'membership_upsell', label: 'Membership upsell', category: 'retention' },
  { key: 'review_request', label: 'Review request', category: 'retention' },
  { key: 'rebook_reminder', label: 'Rebook reminder', category: 'retention' },
  { key: 'referral_follow_up', label: 'Referral follow-up', category: 'sales' },
  { key: 'fleet', label: 'Fleet / B2B', category: 'sales' },
  { key: 'warm_lead', label: 'Warm lead', category: 'sales' },
];

export const WEB_AGENCY_OPPORTUNITY_TYPES: IndustryOpportunityType[] = [
  { key: 'website_project', label: 'Website project', category: 'project' },
  { key: 'redesign', label: 'Redesign', category: 'project' },
  { key: 'seo', label: 'SEO', category: 'service' },
  { key: 'hosting', label: 'Hosting', category: 'service' },
  { key: 'maintenance', label: 'Maintenance retainer', category: 'retention' },
  { key: 'ads', label: 'Paid ads', category: 'service' },
  { key: 'consultation', label: 'Consultation', category: 'sales' },
  { key: 'proposal_follow_up', label: 'Proposal follow-up', category: 'sales' },
  { key: 'project_milestone', label: 'Project milestone', category: 'project' },
  { key: 'testimonial_referral', label: 'Testimonial / referral', category: 'retention' },
  { key: 'external_lead', label: 'External website lead', category: 'sales' },
];

export function opportunityTypesForIndustry(industry: string): IndustryOpportunityType[] {
  if (industry === 'web_agency' || industry === 'marketing_agency') return WEB_AGENCY_OPPORTUNITY_TYPES;
  if (industry === 'mobile_detailing' || industry === 'pressure_washing' || industry === 'cleaning') {
    return DETAILING_OPPORTUNITY_TYPES;
  }
  return [...DETAILING_OPPORTUNITY_TYPES, ...WEB_AGENCY_OPPORTUNITY_TYPES.filter((t) => t.key === 'external_lead')];
}

export function labelForOpportunityType(key: string, industry?: string): string {
  const types = opportunityTypesForIndustry(industry ?? 'mobile_detailing');
  return types.find((t) => t.key === key)?.label ?? key.replace(/_/g, ' ');
}
