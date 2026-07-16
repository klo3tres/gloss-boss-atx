import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadMarketingCampaigns, saveMarketingCampaigns, type MarketingCampaign } from '@/lib/business-modules';
import { upsertSiteSetting } from '@/lib/site-settings-upsert';
import { fetchWeatherForAddress, type WeatherSnapshot } from '@/lib/weather-forecast';

export type WeatherEventKey =
  | 'rain_ended'
  | 'clear_after_rain'
  | 'heavy_rain'
  | 'multi_day_rain_ended'
  | 'pollen_spike'
  | 'dust_or_wind'
  | 'extreme_heat'
  | 'freeze'
  | 'sunny_weekend_capacity'
  | 'upcoming_dry_window'
  | 'cancellation_recovery';

export type WeatherCampaignSettings = {
  recommendationsEnabled: boolean;
  autoDraftEnabled: boolean;
  autoSendEnabled: boolean;
  requireOwnerApproval: boolean;
  minimumHoursAfterRain: number;
  minimumRainyDays: number;
  maxCampaignsPerWeek: number;
  cooldownDays: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  eligibleServiceAreas: string[];
  eligibleSegments: string[];
  minimumOpenCapacity: number;
  maxMessages: number;
  channels: Array<'sms' | 'email'>;
  defaultPromotion: string | null;
  promoStacking: 'blocked' | 'allowed';
  manualPollenSpike: boolean;
};

const SETTINGS_KEY = 'weather_campaign_settings';
const SNAPSHOT_KEY = 'weather_campaign_last_snapshot';

export const DEFAULT_WEATHER_CAMPAIGN_SETTINGS: WeatherCampaignSettings = {
  recommendationsEnabled: true,
  autoDraftEnabled: true,
  autoSendEnabled: false,
  requireOwnerApproval: true,
  minimumHoursAfterRain: 3,
  minimumRainyDays: 1,
  maxCampaignsPerWeek: 2,
  cooldownDays: 14,
  quietHoursStart: '20:00',
  quietHoursEnd: '08:00',
  eligibleServiceAreas: ['Austin', 'Round Rock', 'Pflugerville', 'Georgetown'],
  eligibleSegments: ['recent', 'lapsed', 'member', 'ceramic', 'multi_vehicle'],
  minimumOpenCapacity: 1,
  maxMessages: 100,
  channels: ['sms', 'email'],
  defaultPromotion: null,
  promoStacking: 'blocked',
  manualPollenSpike: false,
};

function parseSetting<T>(value: unknown, fallback: T): T {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' ? ({ ...fallback, ...parsed } as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function loadWeatherCampaignSettings(admin: SupabaseClient): Promise<WeatherCampaignSettings> {
  const { data } = await admin.from('site_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
  const settings = parseSetting(data?.value, DEFAULT_WEATHER_CAMPAIGN_SETTINGS);
  // Sending always starts locked. It must be deliberately enabled and owner approval can still block it.
  return { ...settings, autoSendEnabled: Boolean(settings.autoSendEnabled), requireOwnerApproval: settings.requireOwnerApproval !== false };
}

function weatherEvent(snapshot: WeatherSnapshot, previous: WeatherSnapshot | null, settings: WeatherCampaignSettings): WeatherEventKey {
  const days = snapshot.dailyForecasts ?? [];
  const rainyDays = days.filter((day) => day.isRainy).length;
  const priorWet = Number(previous?.rainChancePct ?? 0) >= 50 || (previous?.rainWarningDays?.length ?? 0) >= settings.minimumRainyDays;
  const currentDry = Number(snapshot.rainChancePct ?? 100) < 30;
  if (settings.manualPollenSpike) return 'pollen_spike';
  if (priorWet && currentDry && (previous?.rainWarningDays?.length ?? 0) > 1) return 'multi_day_rain_ended';
  if (priorWet && currentDry) return 'rain_ended';
  if (snapshot.heatWarning) return 'extreme_heat';
  if (days.some((day) => day.tempMinF <= 32)) return 'freeze';
  if (days.filter((day) => day.rainChancePct >= 70).length > 1) return 'heavy_rain';
  if (rainyDays >= settings.minimumRainyDays && days.some((day) => day.isBest)) return 'clear_after_rain';
  if (days.some((day) => day.isBest)) return 'upcoming_dry_window';
  return 'cancellation_recovery';
}

function offerFor(service: string, visitCount: number, vehicleCount: number, isMember: boolean): { segment: string; offer: string } {
  if (isMember) return { segment: 'member', offer: 'Member booking reminder' };
  if (vehicleCount >= 2) return { segment: 'multi_vehicle', offer: 'Two-car refresh offer' };
  if (/ceramic/i.test(service)) return { segment: 'ceramic', offer: 'Ceramic-safe maintenance wash' };
  if (/interior|refresh/i.test(service)) return { segment: 'interior', offer: 'Quick Refresh' };
  if (visitCount === 0) return { segment: 'lapsed', offer: 'Reactivation offer' };
  return { segment: 'recent', offer: 'Exterior refresh' };
}

function eventLabel(event: WeatherEventKey): string {
  return event.replaceAll('_', ' ');
}

function variants(event: WeatherEventKey, bookingLink: string) {
  const weather = eventLabel(event);
  return {
    quick: `Hey {{first_name}}, ${weather} in {{city}}. Your {{vehicle}} may be ready for {{service_recommendation}}. Openings: {{available_times}}. ${bookingLink}`,
    professional: `Hi {{first_name}}, the latest local forecast shows ${weather}. Based on your last {{last_service}} visit, Titan recommends {{service_recommendation}} for your {{vehicle}}. View available times: ${bookingLink}`,
    warm: `Hi {{first_name}}, the weather is giving {{city}} a good detailing window. If your {{vehicle}} needs a reset after ${weather}, we saved a few openings for {{service_recommendation}}. ${bookingLink}`,
    emailSubject: `A fresh detailing window is opening in {{city}}`,
    emailBody: `Hi {{first_name}},\n\nTitan noticed ${weather} and matched your service history to {{service_recommendation}}. You currently have {{loyalty_progress}} loyalty progress and {{membership_status}} membership status. Available times: {{available_times}}.\n\nBook: ${bookingLink}`,
    social: `A better detailing window is opening after ${weather}. Gloss Boss ATX has limited mobile appointments available. ${bookingLink}`,
  };
}

export async function createWeatherCampaignDraft(admin: SupabaseClient) {
  const settings = await loadWeatherCampaignSettings(admin);
  if (!settings.recommendationsEnabled) return { skipped: true, reason: 'Weather recommendations are disabled.' };

  const baseAddress = process.env.BUSINESS_HOME_BASE_ADDRESS?.trim() || 'Austin, TX';
  const snapshot = await fetchWeatherForAddress(baseAddress);
  if (!snapshot.ok) throw new Error(snapshot.blocker || 'Weather forecast unavailable.');

  const previousRow = await admin.from('site_settings').select('value').eq('key', SNAPSHOT_KEY).maybeSingle();
  const previous = parseSetting<WeatherSnapshot | null>(previousRow.data?.value, null);
  const event = weatherEvent(snapshot, previous, settings);
  const now = new Date();
  const futureEnd = new Date(now.getTime() + 3 * 86400000).toISOString();
  const recentStart = new Date(now.getTime() - 365 * 86400000).toISOString();
  const cooldownStart = new Date(now.getTime() - settings.cooldownDays * 86400000).toISOString();

  const [customers, appointments, futureBookings, memberships, recentWeatherRecipients, activePromos] = await Promise.all([
    admin.from('customers').select('id, full_name, email, phone, sms_consent, sms_status, email_marketing_opt_in').limit(500),
    admin.from('appointments').select('id, customer_id, guest_email, service_slug, service_city, vehicle_description, booking_vehicles, job_completed_at, completed_at, notes').eq('status', 'completed').gte('scheduled_start', recentStart).limit(1000),
    admin.from('appointments').select('id, scheduled_start, status').gte('scheduled_start', now.toISOString()).lte('scheduled_start', futureEnd).not('status', 'eq', 'cancelled').limit(200),
    admin.from('customer_memberships').select('customer_id, status').eq('status', 'active').limit(500),
    admin.from('customer_campaign_recipients').select('customer_id, created_at, customer_campaigns!inner(meta)').gte('created_at', cooldownStart).limit(1000),
    admin.from('promo_codes').select('code').eq('enabled', true).eq('archived', false).limit(1),
  ]);

  const booked = futureBookings.data?.length ?? 0;
  const totalCapacity = 9; // Three mobile-detail slots per day over the three-day action window.
  const openCapacity = Math.max(0, totalCapacity - booked);
  if (openCapacity < settings.minimumOpenCapacity) return { skipped: true, reason: 'No eligible appointment capacity.', openCapacity };

  const memberIds = new Set((memberships.data ?? []).map((row) => String(row.customer_id)));
  const cooledIds = new Set(
    (recentWeatherRecipients.data ?? [])
      .filter((row) => Boolean((row as Record<string, unknown>).customer_id))
      .map((row) => String((row as Record<string, unknown>).customer_id)),
  );
  const history = new Map<string, Array<Record<string, unknown>>>();
  for (const raw of appointments.data ?? []) {
    const row = raw as Record<string, unknown>;
    const key = String(row.customer_id ?? row.guest_email ?? '');
    if (!key) continue;
    history.set(key, [...(history.get(key) ?? []), row]);
  }

  let blocked = 0;
  const profiles: Array<Record<string, unknown>> = [];
  for (const raw of customers.data ?? []) {
    const customer = raw as Record<string, unknown>;
    const id = String(customer.id ?? '');
    const visits = history.get(id) ?? history.get(String(customer.email ?? '')) ?? [];
    const last = visits.sort((a, b) => Date.parse(String(b.job_completed_at ?? b.completed_at ?? 0)) - Date.parse(String(a.job_completed_at ?? a.completed_at ?? 0)))[0];
    const unsafeNotes = /biohazard|heavy soil|excessive pet hair|deep.clean/i.test(String(last?.notes ?? ''));
    const optedOut = String(customer.sms_status ?? '').toLowerCase() === 'opted_out';
    const hasChannel = (customer.sms_consent === true && customer.phone) || (customer.email_marketing_opt_in === true && customer.email);
    if (!id || cooledIds.has(id) || optedOut || unsafeNotes || !hasChannel) {
      blocked++;
      continue;
    }
    const vehicleCount = Array.isArray(last?.booking_vehicles) ? last.booking_vehicles.length : 1;
    const recommendation = offerFor(String(last?.service_slug ?? ''), visits.length, vehicleCount, memberIds.has(id));
    if (!settings.eligibleSegments.includes(recommendation.segment) && recommendation.segment !== 'interior') {
      blocked++;
      continue;
    }
    profiles.push({
      customerId: id,
      firstName: String(customer.full_name ?? 'there').split(' ')[0],
      city: String(last?.service_city ?? 'Austin'),
      vehicle: String(last?.vehicle_description ?? 'vehicle'),
      lastService: String(last?.service_slug ?? 'detail'),
      daysSinceLastAppointment: last ? Math.max(0, Math.floor((Date.now() - Date.parse(String(last.job_completed_at ?? last.completed_at))) / 86400000)) : null,
      membershipStatus: memberIds.has(id) ? 'active' : 'non-member',
      loyaltyProgress: 'See customer wallet',
      ceramicStatus: /ceramic/i.test(String(last?.service_slug ?? '')) ? 'ceramic customer' : 'not recorded',
      currentPromotion: settings.defaultPromotion ?? String(activePromos.data?.[0]?.code ?? 'current offer'),
      availableTimes: `${openCapacity} openings over the next 3 days`,
      weatherEvent: event,
      serviceRecommendation: recommendation.offer,
      qualification: `${eventLabel(event)} · ${recommendation.segment} service history · no future booking detected`,
    });
  }

  const selectedProfiles = profiles.slice(0, settings.maxMessages);
  const id = crypto.randomUUID();
  const bookingLink = `${(process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '')}/book?campaign=${encodeURIComponent(id)}&source=weather`;
  const copy = variants(event, bookingLink);
  const projectedRevenueCents = selectedProfiles.length * 17500;
  const reason = `${eventLabel(event)}. ${selectedProfiles.length} eligible customers passed consent and cooldown checks, and ${openCapacity} appointment slots are open over the next 3 days.`;
  const name = `Weather: ${eventLabel(event)}`;
  const campaign: MarketingCampaign = {
    id,
    name,
    channel: settings.channels.length === 2 ? 'both' : settings.channels[0] ?? 'sms',
    audience: `Weather-qualified customers (${selectedProfiles.length} eligible)`,
    message: copy.quick,
    scheduledAt: null,
    status: 'draft',
    sentCount: 0,
    createdAt: now.toISOString(),
    kind: 'weather',
    recipientProfiles: selectedProfiles.map((profile) => ({
      customerId: String(profile.customerId),
      firstName: String(profile.firstName),
      city: String(profile.city),
      vehicle: String(profile.vehicle),
      lastService: String(profile.lastService),
      daysSinceLastAppointment: profile.daysSinceLastAppointment == null ? null : Number(profile.daysSinceLastAppointment),
      membershipStatus: String(profile.membershipStatus),
      loyaltyProgress: String(profile.loyaltyProgress),
      ceramicStatus: String(profile.ceramicStatus),
      currentPromotion: String(profile.currentPromotion),
      availableTimes: String(profile.availableTimes),
      weatherEvent: String(profile.weatherEvent),
      serviceRecommendation: String(profile.serviceRecommendation),
      qualification: String(profile.qualification),
    })),
    messageVariants: { quick: copy.quick, professional: copy.professional, warm: copy.warm, emailBody: copy.emailBody },
    intelligence: {
      reason,
      estimatedRecipientCount: selectedProfiles.length,
      offer: 'Personalized by service history',
      recommendedPriceCents: null,
      projectedRevenueCents,
      marginWarning: 'Owner approval required. Confirm capacity, exclusions, and promotion stacking before sending.',
      emailSubject: copy.emailSubject,
      socialCaption: copy.social,
      recommendedSendAt: new Date(now.getTime() + settings.minimumHoursAfterRain * 3600000).toISOString(),
      expiresAt: new Date(now.getTime() + 3 * 86400000).toISOString(),
      bookingLink,
      promoCode: (settings.defaultPromotion ?? String(activePromos.data?.[0]?.code ?? '')) || null,
    },
  };

  const existing = await loadMarketingCampaigns(admin);
  await saveMarketingCampaigns(admin, [campaign, ...existing]);
  await admin.from('customer_campaigns').insert({
    id,
    name,
    channel: campaign.channel === 'both' ? 'both' : campaign.channel,
    status: 'draft',
    audience_key: 'weather_qualified',
    audience_label: campaign.audience,
    message_quick: copy.quick,
    message_professional: copy.professional,
    message_warm: copy.warm,
    message_selected: copy.quick,
    recipients_selected: selectedProfiles.length,
    recipients_eligible: selectedProfiles.length,
    recipients_excluded: blocked,
    meta: {
      kind: 'weather_campaign', event, weather: snapshot, settings, reason, openCapacity,
      estimatedRevenueCents: projectedRevenueCents, emailSubject: copy.emailSubject, emailBody: copy.emailBody,
      socialCaption: copy.social, profiles: selectedProfiles, ownerApprovalRequired: true, automaticSendingDisabled: true,
      tracking: { delivery: 0, clicks: 0, bookingStarts: 0, completedBookings: 0, collectedRevenueCents: 0 },
    },
  });
  if (selectedProfiles.length) {
    await admin.from('customer_campaign_recipients').insert(selectedProfiles.map((profile) => ({
      campaign_id: id,
      customer_id: String(profile.customerId),
      status: 'pending',
    })));
  }
  await upsertSiteSetting(admin, { key: SNAPSHOT_KEY, value: JSON.stringify(snapshot) });

  return {
    draftId: id,
    event,
    audience: selectedProfiles.length,
    blocked,
    openCapacity,
    estimatedRevenueCents: projectedRevenueCents,
    ownerApprovalRequired: true,
    sent: 0,
  };
}
