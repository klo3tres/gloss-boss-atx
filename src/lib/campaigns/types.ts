export type CampaignChannel = 'sms' | 'email';
export type CampaignTone = 'quick' | 'professional' | 'warm';

export type CampaignAudienceFilters = {
  search?: string;
  preset?: 'all' | 'recent' | 'lapsed' | 'no_future' | 'cancelled' | 'missed' | 'members' | 'non_members' | 'ceramic' | 'multi_vehicle';
  lastCompletedDays?: 30 | 60 | 90 | 180 | null;
  channel?: CampaignChannel;
  city?: string;
  service?: string;
  vehicle?: string;
  minLoyalty?: number;
  minAverageSpendCents?: number;
  minLifetimeValueCents?: number;
};

export type CampaignAudienceRecipient = {
  customerId: string;
  name: string;
  firstName: string;
  email: string | null;
  phone: string | null;
  canSms: boolean;
  canEmail: boolean;
  blockerReasons: string[];
  city: string;
  vehicle: string;
  vehicleCount: number;
  lastService: string;
  lastCompletedAt: string | null;
  daysSinceLastService: number | null;
  hasFutureBooking: boolean;
  hadCancellation: boolean;
  hadMissedAppointment: boolean;
  membershipStatus: string;
  loyaltyProgress: string;
  loyaltyCount: number;
  ceramicStatus: string;
  averageSpendCents: number;
  lifetimeValueCents: number;
  visitCount: number;
  serviceAreaDistanceMiles: number | null;
};

export type CampaignIdea = {
  id: string;
  name: string;
  reason: string;
  targetAudience: string;
  audienceFilters: CampaignAudienceFilters;
  estimatedEligibleCount: number;
  recommendedOffer: string;
  recommendedService: string;
  recommendedServiceSlug: string;
  projectedBookings: number;
  projectedRevenueCents: number;
  marginWarning: string | null;
  quick: string;
  professional: string;
  warm: string;
  emailSubject: string;
  emailBody: string;
  socialCaption: string;
  recommendedSendTime: string;
  expiresAt: string;
  destinationPath: string;
  promotionId: string | null;
  promoCode: string | null;
};

export type CampaignQueueSummary = {
  campaignId: string;
  status: string;
  total: number;
  eligible: number;
  blocked: number;
  queued: number;
  sent: number;
  delivered: number;
  failed: number;
  clicks: number;
  bookingStarts: number;
  bookings: number;
  completedJobs: number;
  collectedRevenueCents: number;
  unsubscribeCount: number;
  promoUsageCount: number;
};
