import type { CampaignAudienceRecipient, CampaignIdea, CampaignTone } from '@/lib/campaigns/types';

export type CampaignRenderContext = CampaignAudienceRecipient & {
  promotion: string;
  recommendedService: string;
  availableAppointmentWindow: string;
  trackedCampaignLink: string;
};

const TOKEN_MAP: Record<string, keyof CampaignRenderContext> = {
  first_name: 'firstName',
  customer: 'name',
  vehicle: 'vehicle',
  city: 'city',
  last_service: 'lastService',
  days_since_last_service: 'daysSinceLastService',
  membership_status: 'membershipStatus',
  loyalty_progress: 'loyaltyProgress',
  ceramic_status: 'ceramicStatus',
  recommended_service: 'recommendedService',
  promotion: 'promotion',
  available_appointment_window: 'availableAppointmentWindow',
  campaign_link: 'trackedCampaignLink',
};

export function renderCampaignTemplate(template: string, context: CampaignRenderContext) {
  return template.replace(/\{\{([a-z0-9_]+)\}\}/gi, (token, rawKey: string) => {
    const key = TOKEN_MAP[rawKey.toLowerCase()];
    if (!key) return token;
    const value = context[key];
    return value == null || value === '' ? 'not recorded' : String(value);
  });
}

export function templateForTone(idea: Pick<CampaignIdea, 'quick' | 'professional' | 'warm'>, tone: CampaignTone) {
  return tone === 'quick' ? idea.quick : tone === 'warm' ? idea.warm : idea.professional;
}

export function personalizationFieldsUsed(template: string) {
  return [...new Set([...template.matchAll(/\{\{([a-z0-9_]+)\}\}/gi)].map((match) => match[1].toLowerCase()))];
}
