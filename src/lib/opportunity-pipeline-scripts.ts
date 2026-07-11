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
      call_script: `OPENING\nHey, this is ${repName} with ${brandName}. We provide mobile fleet detailing in ${serviceArea}. Who handles vehicle care or fleet maintenance for ${business}?\n\nQUALIFYING QUESTIONS\nâ€¢ About how many vehicles need regular service?\nâ€¢ Are they parked together during business hours?\nâ€¢ How often do appearance, client visits, or resale needs make cleaning urgent?\nâ€¢ Is water/power available, or should we arrive self-contained?\n\nVALUE STATEMENT\nWe service ${vehicles} on-site, document each completed vehicle with photos, and consolidate recurring scheduling and invoicing so vehicles stay working instead of waiting at a shop.\n\nCOMMON OBJECTIONS\nâ€¢ "We already use a wash" â€” We can quote one trial service or cover overflow without replacing them.\nâ€¢ "Send information" â€” What email and vehicle count should I use so the quote is relevant?\nâ€¢ "Too expensive" â€” We can price by frequency and vehicle count; the first step is a no-pressure comparison.\n\nASK\nWould a 10-minute site look or written fleet quote be easier this week?\n\nVOICEMAIL\nHi, this is ${repName} with ${brandName}. We provide on-site fleet detailing around ${serviceArea}. I wanted to send ${business} a quick recurring-service quote. Call or text me back when convenient.\n\nFOLLOW-UP\nHi, ${repName} with ${brandName} following up on on-site care for ${business}. I can prepare a simple quote once I know the approximate vehicle count and service frequency.`,
      sms_pitch: `Hey, this is ${repName} with ${brandName}. I saw ${business} around ${serviceArea} and wanted to see if you ever need recurring mobile washes on-site. We handle exterior maintenance, photos, and simple recurring schedules so your team doesn't have to move vehicles. Want me to send a quick fleet quote?`,
      email_pitch: `Hello,\n\nMy name is ${repName} with ${brandName} — insured mobile detailing serving ${serviceArea}.\n\nI noticed ${business} (${category}) and wanted to reach out about on-site fleet or lot detailing. We keep ${vehicles} photo-ready without disrupting your workday, provide service records, and can set up a simple recurring route.\n\nWould you be open to a brief call or a written fleet quote?\n\n— ${repName}\n${brandName}\n${site}`,
      follow_up_no_response: `Hi ${contact}, ${repName} with ${brandName} following up. Happy to send a no-obligation fleet quote for on-site mobile washes — most teams save time vs. driving vehicles out. Want me to send numbers?`,
      quote_intro: `Hi ${contact}, here's a quick fleet quote for ${business} — mobile on-site service in ${serviceArea}, recurring options available, and we handle photos + invoicing in one place.`,
    };
  }

  return {
    call_script: `OPENING\nHey ${contact}, this is ${repName} with ${brandName} â€” premium mobile detailing in ${serviceArea}. You recently showed interest in ${opp.title.toLowerCase()}. Is now a bad time for a quick question?\n\nQUALIFYING QUESTIONS\nâ€¢ What vehicle and service are you considering?\nâ€¢ What matters most: interior reset, exterior protection, or both?\nâ€¢ Do you have a preferred day and service address?\nâ€¢ Is there a stain, pet hair, odor, coating, or deadline we should plan for?\n\nVALUE STATEMENT\nWe come to your location, confirm pricing before work begins, and keep your appointment, photos, receipts, loyalty, and future booking in one customer portal.\n\nCOMMON OBJECTIONS\nâ€¢ "I need to think" â€” I can text exact options so there is no pressure.\nâ€¢ "What's the price?" â€” I can quote accurately once I confirm vehicle size and condition.\nâ€¢ "I'm busy" â€” That's exactly why we're mobile; I can text a booking link and available windows.\n\nASK\nWould you prefer exact pricing by text, or should I hold a time while we finish the details?\n\nVOICEMAIL\nHey ${contact}, this is ${repName} with ${brandName}. I'm following up on your detailing inquiry. We come to you in ${serviceArea}. I'll send a short message so you can reply whenever convenient.\n\nFOLLOW-UP\nHey ${contact}, just circling back from ${brandName}. If you still need the detail, I can send exact pricing or available times without any pressure.`,
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

/** Default opportunity follow-up cadence: day 0, 2, 7, 14, then day-60 reactivation. */
export const OPPORTUNITY_FOLLOW_UP_DAYS = [0, 2, 7, 14, 60] as const;
export const OPPORTUNITY_SNOOZE_DAYS = 60;

export function nextOpportunityFollowUpDate(step: number, from = new Date()): Date | null {
  const day = OPPORTUNITY_FOLLOW_UP_DAYS[step];
  if (day == null) return null;
  const d = new Date(from);
  d.setDate(d.getDate() + day);
  d.setHours(10, 0, 0, 0);
  return d;
}
