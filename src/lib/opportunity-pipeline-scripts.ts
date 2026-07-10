import type { RevenueOpportunity } from '@/lib/titan/revenue-opportunities';

export type OpportunityScriptKey =
  | 'call_script'
  | 'sms_pitch'
  | 'email_pitch'
  | 'follow_up_no_response'
  | 'quote_intro';

export type OpportunityScriptSet = Record<OpportunityScriptKey, string>;

export type OpportunityScriptContext = {
  businessName?: string | null;
  brandName?: string | null;
  repName?: string | null;
  serviceArea?: string | null;
  websiteUrl?: string | null;
  category?: string | null;
  contactName?: string | null;
  vehicleCount?: number | null;
  address?: string | null;
  estimatedValue?: string | null;
};

function brand(ctx: OpportunityScriptContext) {
  return ctx.brandName?.trim() || ctx.businessName?.trim() || 'Gloss Boss ATX';
}

function rep(ctx: OpportunityScriptContext) {
  return ctx.repName?.trim() || 'your team';
}

function area(ctx: OpportunityScriptContext) {
  return ctx.serviceArea?.trim() || 'Austin / Round Rock';
}

function name(ctx: OpportunityScriptContext) {
  return ctx.contactName?.trim() || ctx.businessName?.trim() || 'there';
}

function fleetSize(ctx: OpportunityScriptContext) {
  const n = ctx.vehicleCount;
  if (n && n > 0) return `your ${n}-vehicle fleet`;
  return 'your service vehicles';
}

export function buildOpportunityScripts(opp: RevenueOpportunity, ctx: OpportunityScriptContext = {}): OpportunityScriptSet {
  const contact = name({ ...ctx, contactName: ctx.contactName ?? opp.contactName });
  const business = ctx.businessName ?? opp.title;
  const category = ctx.category ?? String(opp.opportunityType).replace(/_/g, ' ');
  const vehicles = fleetSize(ctx);
  const serviceArea = area(ctx);
  const brandName = brand(ctx);
  const repName = rep(ctx);
  const site = ctx.websiteUrl?.replace(/^https?:\/\//, '') || 'glossbossatx.com';

  const isFleet = ['fleet', 'dealership', 'apartment_hoa', 'google_places'].includes(String(opp.opportunityType));

  if (isFleet) {
    return {
      call_script: `Hey, this is ${repName} with ${brandName}. We're a mobile detailing company in the ${serviceArea} area. I was reaching out because businesses like ${business} usually have vehicles that need to stay clean without taking them off the road. We can come on-site, handle recurring washes for ${vehicles}, document the work with photos, and invoice everything together. Who would be the best person to talk to about vehicle cleaning or fleet maintenance?`,
      sms_pitch: `Hey, this is ${repName} with ${brandName}. I saw ${business} around ${serviceArea} and wanted to see if you ever need recurring mobile washes on-site. We handle exterior maintenance, photos, and simple recurring schedules so your team doesn't have to move vehicles. Want me to send a quick fleet quote?`,
      email_pitch: `Hello,\n\nMy name is ${repName} with ${brandName} — insured mobile detailing serving ${serviceArea}.\n\nI noticed ${business} (${category}) and wanted to reach out about on-site fleet or lot detailing. We keep ${vehicles} photo-ready without disrupting your workday, provide service records, and can set up a simple recurring route.\n\nWould you be open to a brief call or a written fleet quote?\n\n— ${repName}\n${brandName}\n${site}`,
      follow_up_no_response: `Hi ${contact}, ${repName} with ${brandName} following up. Happy to send a no-obligation fleet quote for on-site mobile washes — most teams save time vs. driving vehicles out. Want me to send numbers?`,
      quote_intro: `Hi ${contact}, here's a quick fleet quote for ${business} — mobile on-site service in ${serviceArea}, recurring options available, and we handle photos + invoicing in one place.`,
    };
  }

  return {
    call_script: `Hey ${contact}, this is ${repName} with ${brandName} — mobile premium detailing in ${serviceArea}. I had a thought about ${opp.title.toLowerCase()}. We come to you, handle the detail on-site, and you don't lose part of your day. Is now a bad time for a quick chat?`,
    sms_pitch: opp.recommendedMessage || `Hey ${contact}, ${repName} with ${brandName} — mobile detailing in ${serviceArea}. Got an opening this week if you still need service. Want pricing or a booking link?`,
    email_pitch: `Hi ${contact},\n\n${repName} here with ${brandName} — mobile detailing in the ${serviceArea} area.\n\n${opp.whySurfaced}\n\nWe come to your location, handle premium interior/exterior details on-site, and you can book in two taps.\n\nHappy to send availability or hold a spot this week.\n\n— ${repName}\n${brandName}\n${site}`,
    follow_up_no_response: `Hey ${contact}, just checking in from ${brandName}. Still happy to help with mobile detailing — want me to send times or a quick quote?`,
    quote_intro: `Hi ${contact}, here's your ${brandName} quote for ${opp.title} — mobile on-site service, insured, and easy online booking.`,
  };
}

export function explainOpportunityValue(opp: RevenueOpportunity): string {
  const parts: string[] = [];
  if (opp.estimatedRevenueCents > 0) {
    parts.push(`Est. ${(opp.estimatedRevenueCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} based on typical ${String(opp.opportunityType).replace(/_/g, ' ')} job value.`);
  }
  if (opp.confidenceScore) parts.push(`${opp.confidenceScore}% confidence from Titan scoring.`);
  if (opp.whySurfaced) parts.push(opp.whySurfaced);
  return parts.join(' ');
}

/** Default opportunity follow-up cadence: day 0, 2, 7, 14, then snooze 60d */
export const OPPORTUNITY_FOLLOW_UP_DAYS = [0, 2, 7, 14] as const;
export const OPPORTUNITY_SNOOZE_DAYS = 60;

export function nextOpportunityFollowUpDate(step: number, from = new Date()): Date | null {
  const day = OPPORTUNITY_FOLLOW_UP_DAYS[step];
  if (day == null) return null;
  const d = new Date(from);
  d.setDate(d.getDate() + day);
  d.setHours(10, 0, 0, 0);
  return d;
}
