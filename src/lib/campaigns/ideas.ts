import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCampaignAudience } from '@/lib/campaigns/audience';
import type { CampaignAudienceFilters, CampaignAudienceRecipient, CampaignIdea } from '@/lib/campaigns/types';

type Row = Record<string, unknown>;
const DAY = 86400000;

function str(value: unknown) { return value == null ? '' : String(value).trim(); }
function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function idea(input: {
  id: string; name: string; reason: string; audience: string; filters: CampaignAudienceFilters; eligible: number;
  offer: string; service: string; serviceSlug?: string; averageTicket: number; conversion?: number; promo?: Row | null;
  quick: string; professional: string; warm: string; subject: string; emailBody: string; social: string; sendHour?: number; daysValid?: number; destinationPath?: string;
}): CampaignIdea {
  const projectedBookings = Math.max(0, Math.round(input.eligible * (input.conversion ?? 0.12)));
  const promotionCode = str(input.promo?.code) || null;
  const promotionId = str(input.promo?.id) || null;
  const serviceSlug = input.serviceSlug || slug(input.service);
  const query = new URLSearchParams({ service: serviceSlug });
  if (promotionId) query.set('offer', promotionId);
  const send = new Date();
  send.setHours(input.sendHour ?? 10, 0, 0, 0);
  if (send.getTime() < Date.now()) send.setDate(send.getDate() + 1);
  return {
    id: input.id, name: input.name, reason: input.reason, targetAudience: input.audience, audienceFilters: input.filters,
    estimatedEligibleCount: input.eligible, recommendedOffer: input.offer, recommendedService: input.service,
    recommendedServiceSlug: serviceSlug, projectedBookings, projectedRevenueCents: projectedBookings * input.averageTicket,
    marginWarning: promotionCode ? 'Confirm the promotion margin and stacking rules before sending.' : null,
    quick: input.quick, professional: input.professional, warm: input.warm, emailSubject: input.subject,
    emailBody: input.emailBody, socialCaption: input.social, recommendedSendTime: send.toISOString(),
    expiresAt: new Date(Date.now() + (input.daysValid ?? 5) * DAY).toISOString(), destinationPath: input.destinationPath ?? `/book?${query.toString()}`,
    promotionId, promoCode: promotionCode,
  };
}

export async function generateCampaignIdeas(admin: SupabaseClient): Promise<CampaignIdea[]> {
  const [{ recipients }, promosRes, servicesRes, futureRes, settingsRes] = await Promise.all([
    loadCampaignAudience(admin, { page: 1, pageSize: 2500, filters: {} }),
    admin.from('promo_codes').select('id, code, description, discount_type, discount_value, max_uses, current_uses, rules, starts_at, ends_at').eq('enabled', true).is('archived_at', null).limit(20),
    admin.from('services').select('id, slug, name, active').eq('active', true).limit(100),
    admin.from('appointments').select('scheduled_start, status').gte('scheduled_start', new Date().toISOString()).lte('scheduled_start', new Date(Date.now() + 7 * DAY).toISOString()).limit(500),
    admin.from('site_settings').select('key, value').in('key', ['weather_campaign_latest_snapshot', 'monthly_revenue_goal_cents']).limit(10),
  ]);
  const activePromos = ((promosRes.data ?? []) as Row[]).filter((row) => !row.ends_at || Date.parse(str(row.ends_at)) > Date.now());
  const promo = activePromos[0] ?? null;
  const services = (servicesRes.data ?? []) as Row[];
  const service = (pattern: RegExp, fallback: string) => {
    const row = services.find((item) => pattern.test(`${str(item.name)} ${str(item.slug)}`));
    return { name: str(row?.name) || fallback, slug: str(row?.slug) || slug(fallback) };
  };
  const exterior = service(/exterior|wash|refresh/i, 'Exterior Refresh');
  const interior = service(/interior|quick.refresh/i, 'Quick Refresh');
  const ceramic = service(/ceramic|maintenance/i, 'Ceramic-safe Maintenance');
  const full = service(/full|signature|complete/i, 'Full Detail');
  const avgTicket = Math.max(15000, Math.round(recipients.reduce((sum, row) => sum + row.averageSpendCents, 0) / Math.max(1, recipients.filter((row) => row.averageSpendCents > 0).length)) || 19000);
  const eligible = (test: (row: CampaignAudienceRecipient) => boolean) => recipients.filter((row) => (row.canSms || row.canEmail) && test(row)).length;
  const recent = eligible((row) => row.daysSinceLastService != null && row.daysSinceLastService <= 90);
  const lapsed = eligible((row) => row.daysSinceLastService != null && row.daysSinceLastService >= 90 && !row.hasFutureBooking);
  const noFuture = eligible((row) => !row.hasFutureBooking);
  const cancelled = eligible((row) => row.hadCancellation);
  const members = eligible((row) => row.membershipStatus !== 'Non-member');
  const nonMembers = eligible((row) => row.membershipStatus === 'Non-member');
  const ceramicCount = eligible((row) => row.ceramicStatus === 'Ceramic customer');
  const multiVehicle = eligible((row) => row.vehicleCount > 1);
  const loyalty = eligible((row) => row.loyaltyCount > 0);
  const highValue = eligible((row) => row.lifetimeValueCents >= Math.max(avgTicket * 2, 30000));
  const bookedSlots = (futureRes.data ?? []).filter((row) => !['cancelled', 'canceled'].includes(str((row as Row).status).toLowerCase())).length;
  const capacityReason = `${bookedSlots} appointments are currently booked over the next seven days; confirm open slots before sending.`;
  const weatherRow = ((settingsRes.data ?? []) as Row[]).find((row) => str(row.key).includes('weather'));
  const weatherText = JSON.stringify(weatherRow?.value ?? '').toLowerCase();
  const rainSignal = /rain|storm|wet/.test(weatherText);
  const standardTokens = '{{first_name}}, your {{vehicle}} may be ready for {{recommended_service}}. {{promotion}} View openings: {{campaign_link}}';
  const professionalTokens = 'Hi {{first_name}}, based on your last {{last_service}} and your {{vehicle}}, we recommend {{recommended_service}}. {{promotion}} Current availability: {{available_appointment_window}}. Reserve here: {{campaign_link}}';
  const warmTokens = 'Hey {{first_name}}! We hope you and your {{vehicle}} are doing well. We saved a recommendation for you: {{recommended_service}}. {{promotion}} Take a look whenever you are ready: {{campaign_link}}';

  const ideas: CampaignIdea[] = [
    idea({ id:'rain-recovery', name:'Rain Recovery Refresh', reason: rainSignal ? `Recent weather data contains a rain signal. ${capacityReason}` : `A rain-recovery campaign is ready for owner use after the next wet period. ${capacityReason}`, audience:'Customers with no future booking', filters:{preset:'no_future'}, eligible:noFuture, offer:str(promo?.description)||'Post-rain refresh openings', service:exterior.name, serviceSlug:exterior.slug, averageTicket:avgTicket, promo, quick:'Hey {{first_name}}, the rain has finally moved on. Give your {{vehicle}} a reset with {{recommended_service}}. {{promotion}} {{campaign_link}}', professional:'Hi {{first_name}}, after the recent rain, your {{vehicle}} may benefit from {{recommended_service}}. {{promotion}} We currently have {{available_appointment_window}}: {{campaign_link}}', warm:'Hey {{first_name}}! The weather is clearing up, and we would love to help your {{vehicle}} feel fresh again. We recommend {{recommended_service}}. {{promotion}} {{campaign_link}}', subject:'The rain is gone — refresh your vehicle', emailBody:professionalTokens, social:'The rain is moving out. Refresh openings are available this week.', sendHour:10 }),
    idea({ id:'recent-refresh', name:'Recent Customer Refresh', reason:'Recent customers already know the service and are strong candidates for a simple maintenance visit.', audience:'Completed within 90 days', filters:{preset:'recent',lastCompletedDays:90}, eligible:recent, offer:str(promo?.description)||'Maintenance opening', service:exterior.name, serviceSlug:exterior.slug, averageTicket:avgTicket, promo, quick:standardTokens, professional:professionalTokens, warm:warmTokens, subject:'Ready for your next refresh?', emailBody:professionalTokens, social:'Maintenance openings are available for returning customers.' }),
    idea({ id:'lapsed-reactivation', name:'Lapsed Customer Reactivation', reason:'Customers 90+ days from their last completed service have no future booking.', audience:'Lapsed customers', filters:{preset:'lapsed'}, eligible:lapsed, offer:str(promo?.description)||'Welcome-back opening', service:full.name, serviceSlug:full.slug, averageTicket:avgTicket, conversion:.09, promo, quick:standardTokens, professional:professionalTokens, warm:warmTokens, subject:'It may be time for your next detail', emailBody:professionalTokens, social:'Been a while? Mobile detail openings are available.' }),
    idea({ id:'ceramic-maintenance', name:'Ceramic Maintenance', reason:'Ceramic customers need compatible maintenance rather than a generic wash.', audience:'Ceramic customers', filters:{preset:'ceramic'}, eligible:ceramicCount, offer:'Ceramic-safe maintenance opening', service:ceramic.name, serviceSlug:ceramic.slug, averageTicket:avgTicket, quick:standardTokens, professional:professionalTokens, warm:warmTokens, subject:'Ceramic-safe maintenance for your vehicle', emailBody:professionalTokens, social:'Protect your coating with ceramic-safe maintenance.' }),
    idea({ id:'member-reminder', name:'Member Booking Reminder', reason:'Active members should receive a benefit-focused reminder, not a public discount.', audience:'Active members', filters:{preset:'members'}, eligible:members, offer:'Use your active member benefits', service:exterior.name, serviceSlug:exterior.slug, averageTicket:avgTicket, quick:standardTokens, professional:professionalTokens, warm:warmTokens, subject:'Your member booking reminder', emailBody:professionalTokens, social:'Member openings are available this week.' }),
    idea({ id:'membership-conversion', name:'Membership Invitation', reason:'Repeat non-members can be invited to compare membership value.', audience:'Non-members', filters:{preset:'non_members'}, eligible:nonMembers, offer:'Explore membership pricing', service:exterior.name, serviceSlug:exterior.slug, averageTicket:avgTicket, conversion:.06, quick:'{{first_name}}, your {{vehicle}} may be a good fit for Gloss Boss membership benefits. See the options: {{campaign_link}}', professional:'Hi {{first_name}}, based on your service history, a membership could make maintaining your {{vehicle}} simpler. Review benefits here: {{campaign_link}}', warm:'Hey {{first_name}}! If you want an easier way to keep your {{vehicle}} looking great, our membership options may be a fit: {{campaign_link}}', subject:'A simpler way to maintain your vehicle', emailBody:professionalTokens, social:'Keep your vehicle maintained with member pricing.', destinationPath:'/memberships' }),
    idea({ id:'loyalty-progress', name:'Loyalty Progress Reminder', reason:'Customers with existing punches are closer to a reward and have a concrete reason to return.', audience:'Customers with loyalty progress', filters:{minLoyalty:1}, eligible:loyalty, offer:'Continue your loyalty progress', service:exterior.name, serviceSlug:exterior.slug, averageTicket:avgTicket, quick:'{{first_name}}, you currently have {{loyalty_progress}}. Keep your progress moving with {{recommended_service}}: {{campaign_link}}', professional:'Hi {{first_name}}, your Gloss Boss loyalty progress is {{loyalty_progress}}. Your recommended next service is {{recommended_service}}. View openings: {{campaign_link}}', warm:'Hey {{first_name}}! You already have {{loyalty_progress}}, and we would love to help you get closer to your next reward: {{campaign_link}}', subject:'Your Gloss Boss loyalty progress', emailBody:professionalTokens, social:'Book, earn punches, and keep your vehicle on schedule.' }),
    idea({ id:'cancellation-recovery', name:'Cancelled Appointment Recovery', reason:'Customers with a cancelled appointment can be offered a low-pressure path back to the calendar.', audience:'Customers with cancelled appointments', filters:{preset:'cancelled'}, eligible:cancelled, offer:'Easy rescheduling', service:full.name, serviceSlug:full.slug, averageTicket:avgTicket, conversion:.15, quick:'{{first_name}}, if you still need service for your {{vehicle}}, you can pick a new time here: {{campaign_link}}', professional:'Hi {{first_name}}, we noticed your previous appointment did not work out. If you still need {{recommended_service}} for your {{vehicle}}, current openings are here: {{campaign_link}}', warm:'Hey {{first_name}}, schedules change. Whenever you are ready, we would be happy to find a better time for your {{vehicle}}: {{campaign_link}}', subject:'Choose a better time for your detail', emailBody:professionalTokens, social:'Need to reschedule? New mobile detail openings are available.' }),
    idea({ id:'multi-vehicle', name:'Two-Car Refresh', reason:'Multi-vehicle households can increase route efficiency and average order value.', audience:'Multi-vehicle households', filters:{preset:'multi_vehicle'}, eligible:multiVehicle, offer:'Multi-vehicle scheduling', service:exterior.name, serviceSlug:exterior.slug, averageTicket:Math.round(avgTicket*1.7), quick:'{{first_name}}, want to refresh more than one vehicle in one visit? View multi-vehicle openings: {{campaign_link}}', professional:'Hi {{first_name}}, we can coordinate service for multiple vehicles during one visit. View current availability and multi-car pricing: {{campaign_link}}', warm:'Hey {{first_name}}! We can make it easier to refresh the vehicles at your household in one appointment: {{campaign_link}}', subject:'Refresh multiple vehicles in one visit', emailBody:professionalTokens, social:'Two vehicles, one convenient mobile appointment.' }),
    idea({ id:'high-value-care', name:'High-Value Customer Care', reason:'High-lifetime-value customers deserve a personal, service-fit recommendation.', audience:'Customers with strong spending history', filters:{minLifetimeValueCents:Math.max(avgTicket*2,30000)}, eligible:highValue, offer:'Priority appointment selection', service:full.name, serviceSlug:full.slug, averageTicket:avgTicket, quick:standardTokens, professional:professionalTokens, warm:warmTokens, subject:'A service recommendation for your vehicle', emailBody:professionalTokens, social:'Priority mobile detailing availability is open.' }),
    idea({ id:'weekend-openings', name:'Weekend Openings', reason:capacityReason, audience:'Eligible customers without a future booking', filters:{preset:'no_future'}, eligible:noFuture, offer:'Weekend availability', service:interior.name, serviceSlug:interior.slug, averageTicket:avgTicket, promo, quick:'{{first_name}}, we have weekend availability for {{recommended_service}} on your {{vehicle}}. {{promotion}} {{campaign_link}}', professional:'Hi {{first_name}}, a few weekend appointments are available for {{recommended_service}}. Based on your {{vehicle}}, this may be a good maintenance window. {{campaign_link}}', warm:'Hey {{first_name}}! If the weekend is easier, we have a few openings to refresh your {{vehicle}}: {{campaign_link}}', subject:'Weekend detail openings', emailBody:professionalTokens, social:'Weekend mobile detail appointments are available.', sendHour:9 }),
    idea({ id:'same-week', name:'Same-Week Fill', reason:capacityReason, audience:'Eligible customers without a future booking', filters:{preset:'no_future'}, eligible:noFuture, offer:str(promo?.description)||'Same-week opening', service:interior.name, serviceSlug:interior.slug, averageTicket:avgTicket, promo, quick:standardTokens, professional:professionalTokens, warm:warmTokens, subject:'A few same-week appointments are open', emailBody:professionalTokens, social:'A few same-week mobile detail openings are available.', daysValid:3 }),
  ];
  return ideas.filter((item) => item.estimatedEligibleCount > 0).slice(0, 20);
}
