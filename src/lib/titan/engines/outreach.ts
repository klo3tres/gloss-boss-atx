import type { TitanProspect } from '@/lib/titan/lead-radar';
import { prospectTypeLabel } from '@/lib/titan/lead-radar';
import { generateOutreach } from '@/lib/titan/outreach-os';
import type { TitanOpportunity } from '@/lib/titan/opportunity-scanner';

export type OutreachFollowUp = {
  day: number;
  channel: string;
  message: string;
};

export type OutreachKit = {
  id: string;
  label: string;
  expectedRevenueCents: number;
  sms: string;
  emailSubject: string;
  emailBody: string;
  facebookDm: string;
  nextdoorMessage: string;
  partnershipPitch: string;
  followUpSequence: OutreachFollowUp[];
};

const BOOK = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://glossbossatx.com/book';

function followUps(name: string, company: string): OutreachFollowUp[] {
  return [
    { day: 2, channel: 'SMS', message: `Hi ${name}, following up on mobile detailing for ${company}. Still open to a quick call? ${BOOK}` },
    { day: 5, channel: 'Email', message: `Checking in — Gloss Boss ATX can start with a pilot detail for ${company}. Reply anytime.` },
    { day: 10, channel: 'SMS', message: `Last check-in — happy to quote fleet/resident programs for ${company}. ${BOOK}` },
  ];
}

export function buildOutreachForProspect(prospect: TitanProspect): OutreachKit {
  const pkg = generateOutreach(prospect);
  const name = prospect.contactName || 'there';
  const company = prospect.companyName;
  const typeLabel = prospectTypeLabel(prospect.prospectType);

  return {
    id: `prospect:${prospect.id}`,
    label: company,
    expectedRevenueCents: prospect.estimatedMonthlyCents * 12,
    sms: pkg.smsBody,
    emailSubject: pkg.emailSubject,
    emailBody: pkg.emailBody,
    facebookDm: `Hey ${name}! Gloss Boss ATX — we do mobile detailing for ${typeLabel}s in Austin. Saw ${company} and thought a resident/fleet program might be a fit. Open to a quick DM chat?`,
    nextdoorMessage: `Hi neighbors — Gloss Boss ATX partners with local ${typeLabel}s (${company} area). If your community needs mobile detailing, happy to share resident pricing. DM me!`,
    partnershipPitch: pkg.callScript,
    followUpSequence: followUps(name, company),
  };
}

export function buildOutreachForOpportunity(opp: TitanOpportunity): OutreachKit {
  const name = opp.authorName || 'there';
  const snippet = opp.body?.slice(0, 80) ?? opp.title.slice(0, 80);

  return {
    id: `opp:${opp.id}`,
    label: opp.title.slice(0, 80),
    expectedRevenueCents: opp.valueCents,
    sms: `Hi ${name}, Gloss Boss ATX — saw your post about "${snippet}". We specialize in mobile detailing in Austin. ${BOOK}`,
    emailSubject: `Re: ${opp.title.slice(0, 60)}`,
    emailBody: opp.suggestedReply ?? `Hi ${name},\n\nGloss Boss ATX here — we can help with mobile detailing. Happy to quote.\n\n${BOOK}`,
    facebookDm: opp.suggestedDm ?? `Hi ${name}! Gloss Boss ATX — mobile detailing. Saw your post and we can help. DM for a quote?`,
    nextdoorMessage: `Hi ${name} — Gloss Boss ATX (mobile detailing) responding to your neighborhood post. We service your area — ${BOOK}`,
    partnershipPitch: opp.suggestedReply ?? `Quick intro: Gloss Boss ATX — premium mobile detailing. ${BOOK}`,
    followUpSequence: followUps(name, 'your request'),
  };
}

export function buildOutreachForCustomer(input: {
  customerName: string;
  customerId?: string;
}): OutreachKit {
  const name = input.customerName.split(' ')[0] || 'there';
  return {
    id: `customer:${input.customerId ?? name}`,
    label: input.customerName,
    expectedRevenueCents: 18000,
    sms: `Hi ${name}! Thanks for choosing Gloss Boss ATX. Know anyone who'd love a detail? Refer a friend — you both get $25 off. ${BOOK}`,
    emailSubject: 'Thanks + $25 referral for you',
    emailBody: `Hi ${name},\n\nThank you for trusting Gloss Boss ATX. If you refer a friend, you both get $25 off your next detail.\n\n${BOOK}`,
    facebookDm: `Hey ${name}! Hope you loved your detail. If you refer a neighbor, we'll give you both $25 off — Gloss Boss ATX.`,
    nextdoorMessage: `Great experience with Gloss Boss ATX mobile detailing — they come to you. Happy to refer neighbors!`,
    partnershipPitch: `Hi ${name}, would you leave us a Google review? It helps local mobile detailing. Then I'd love a referral intro if you know anyone.`,
    followUpSequence: [
      { day: 1, channel: 'SMS', message: `Hi ${name}, hope the vehicle looks amazing! Mind leaving a quick Google review?` },
      { day: 3, channel: 'SMS', message: `Refer a friend to Gloss Boss ATX — you both get $25 off. ${BOOK}` },
      { day: 14, channel: 'SMS', message: `Time for another detail? Book maintenance with Gloss Boss ATX. ${BOOK}` },
    ],
  };
}

export function buildOutreachEngineFromBriefing(input: {
  prospects: TitanProspect[];
  opportunities: TitanOpportunity[];
  referralNames: { customerName: string; customerId?: string }[];
}): { kits: OutreachKit[] } {
  const kits: OutreachKit[] = [];

  for (const opp of input.opportunities.slice(0, 5)) {
    kits.push(buildOutreachForOpportunity(opp));
  }
  for (const p of input.prospects.slice(0, 5)) {
    if (kits.length >= 8) break;
    kits.push(buildOutreachForProspect(p));
  }
  for (const c of input.referralNames.slice(0, 3)) {
    kits.push(buildOutreachForCustomer(c));
  }

  return { kits };
}
