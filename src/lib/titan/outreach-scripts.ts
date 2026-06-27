export type ScriptVariant = 'casual' | 'professional' | 'short';

export type OutreachScriptKey =
  | 'warm_lead'
  | 'canceled_reschedule'
  | 'coworker_nurse'
  | 'facebook_comment'
  | 'nextdoor_reply'
  | 'apartment_manager'
  | 'property_manager'
  | 'fleet_owner'
  | 'dealership'
  | 'car_club_admin'
  | 'referral_ask'
  | 'weekend_opening';

export const OUTREACH_SCRIPTS: Record<OutreachScriptKey, Record<ScriptVariant, string>> = {
  warm_lead: {
    casual: 'Hey [Name] — Kyle with Gloss Boss. Got an opening this weekend for an interior detail. Want me to hold it for you?',
    professional: 'Hi [Name], this is Kyle with Gloss Boss ATX. An interior detail slot opened this weekend — would you like me to reserve it for you?',
    short: 'Hey [Name] — opening this weekend for interior detail. Want it?',
  },
  canceled_reschedule: {
    casual: 'Hey [Name], no stress on canceling. I have Tue/Wed open next week if you still want it done — want me to save a spot?',
    professional: 'Hi [Name], thanks for letting me know. I have availability next Tuesday or Wednesday if you would like to reschedule.',
    short: 'Still want your detail? I have next week open — Tue or Wed work?',
  },
  coworker_nurse: {
    casual: 'Hey [Name]! Kyle here — doing mobile details this weekend. Thought of you first before I post the opening.',
    professional: 'Hi [Name], Kyle with Gloss Boss ATX (mobile detailing). I have a weekend opening and wanted to offer it to you first.',
    short: 'Hey [Name] — mobile detail opening this weekend. Interested?',
  },
  facebook_comment: {
    casual: 'Hey [Name]! I run Gloss Boss ATX — mobile detailing in Austin/Round Rock. Happy to help with interiors/full details. Want pricing + openings?',
    professional: 'Hi [Name], Kyle with Gloss Boss ATX. We provide mobile interior and full detailing in the Austin/Round Rock area. I can send availability if helpful.',
    short: 'Kyle — Gloss Boss ATX mobile detail. Happy to help — want times?',
  },
  nextdoor_reply: {
    casual: 'Hey neighbor! Gloss Boss ATX does mobile detailing — we come to you. Happy to send a quote for your vehicle.',
    professional: 'Hello [Name], Gloss Boss ATX offers mobile detailing for Round Rock/Austin residents. I would be glad to provide pricing and availability.',
    short: 'Mobile detailer in the area — Gloss Boss ATX. Can send pricing.',
  },
  apartment_manager: {
    casual: 'Hi — Kyle with Gloss Boss ATX. We do mobile detailing and resident detail days for apartments. Who should I talk to about offering this to residents?',
    professional: 'Hello, my name is Kyle with Gloss Boss ATX. We partner with apartment communities for on-site resident detailing. May I speak with the community manager?',
    short: 'Gloss Boss ATX — resident mobile detail days. Best contact for partnerships?',
  },
  property_manager: {
    casual: 'Hey [Name], Kyle with Gloss Boss ATX — mobile detailing for residents and fleet vehicles. Open to a resident detail day at your property?',
    professional: 'Dear [Name], Gloss Boss ATX provides mobile vehicle detailing for multi-family properties. I would welcome a brief call to discuss a resident detail event.',
    short: 'Mobile detailing for your properties — Gloss Boss ATX. Open to a quick call?',
  },
  fleet_owner: {
    casual: 'Hey [Name], Kyle with Gloss Boss ATX — we keep small fleets clean on-site without downtime. Who handles fleet cleaning on your team?',
    professional: 'Hello [Name], Gloss Boss ATX specializes in mobile fleet detailing for Austin-area businesses. Could we schedule a brief introduction call?',
    short: 'Mobile fleet detailing — Gloss Boss ATX. Who manages vehicle cleaning?',
  },
  dealership: {
    casual: 'Hi — Kyle with Gloss Boss ATX. We help dealers keep lot inventory photo-ready with mobile detailing. Who handles vendor relationships?',
    professional: 'Hello, Gloss Boss ATX provides mobile detailing for dealership inventory and customer delivery prep. I would appreciate an introduction to the appropriate contact.',
    short: 'Lot/detail vendor — Gloss Boss ATX mobile. Best contact?',
  },
  car_club_admin: {
    casual: 'Hey [Name] — Kyle with Gloss Boss ATX. We do mobile premium details for car clubs. Interested in a member group rate for your next meet?',
    professional: 'Hello [Name], Gloss Boss ATX offers mobile detailing packages for automotive clubs. I would like to discuss a member benefit rate.',
    short: 'Club member detail rate — Gloss Boss ATX mobile. Interested?',
  },
  referral_ask: {
    casual: 'Hey [Name] — hope the vehicle still looks great! If anyone asks who details it, I would really appreciate the intro. Happy to take care of them too.',
    professional: 'Hi [Name], thank you again for choosing Gloss Boss. If you know anyone seeking mobile detailing, I would appreciate a referral introduction.',
    short: 'Know anyone who needs mobile detail? Would love a referral!',
  },
  weekend_opening: {
    casual: 'Opening this weekend for mobile interior/full details in Austin/Round Rock — DM me if you want a spot before it fills. — Kyle, Gloss Boss ATX',
    professional: 'Gloss Boss ATX has limited mobile detailing availability this weekend in Austin/Round Rock. Message for pricing and scheduling. — Kyle',
    short: 'Weekend mobile detail openings — Gloss Boss ATX. DM for a spot.',
  },
};

export const SCRIPT_LABELS: Record<OutreachScriptKey, string> = {
  warm_lead: 'Warm lead',
  canceled_reschedule: 'Canceled / reschedule',
  coworker_nurse: 'Coworker / nurse',
  facebook_comment: 'Facebook comment',
  nextdoor_reply: 'Nextdoor reply',
  apartment_manager: 'Apartment manager',
  property_manager: 'Property manager',
  fleet_owner: 'Fleet owner',
  dealership: 'Dealership',
  car_club_admin: 'Car club admin',
  referral_ask: 'Referral ask',
  weekend_opening: 'Weekend opening post',
};
