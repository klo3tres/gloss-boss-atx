import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeMultiCarExample,
  mapCatalogToServicePackages,
  parseDealConfig,
} from '@/lib/public-site-data';
import type { DealConfig, ServicePackage } from '@/lib/site-config';
import { loadActiveServicesResilient, mapServicePriceRows, mergeServicesWithPricesStable } from '@/lib/catalog-fallback';
import { consolidatePriceRowsForUi } from '@/lib/vehicle-pricing';
import { parseBookingAvailabilityConfig } from '@/lib/booking-availability-config';
import { getBusinessHomeBaseAddress } from '@/lib/business-location';

export type SiteGuideLink = { label: string; href: string };

export type SiteGuideReply = {
  message: string;
  links: SiteGuideLink[];
  suggestLeadCapture?: 'quote' | 'handoff' | null;
  questionKey?: string;
};

export type SiteGuideContext = {
  services: ServicePackage[];
  deals: DealConfig;
  fleetEnabled: boolean;
  fleetBlurb: string;
  serviceArea: string;
  availabilityNote: string;
  firstTimeDiscountNote: string;
  membershipNote: string;
  depositNote: string;
};

const SERVICE_AREA =
  'Gloss Boss currently services Round Rock, Pflugerville, Georgetown, Wells Branch, Hutto, and nearby Austin areas.';

async function loadContext(admin: SupabaseClient): Promise<SiteGuideContext> {
  const [svcLoad, pricesRes, dealRes, fleetRes, availRes] = await Promise.all([
    loadActiveServicesResilient(admin),
    admin.from('service_prices').select('*'),
    admin.from('homepage_content').select('value').eq('key', 'deal_config').maybeSingle(),
    admin.from('site_settings').select('key, value').in('key', ['fleet_services_enabled', 'fleet_services_blurb']),
    admin.from('site_settings').select('value').eq('key', 'booking_availability').maybeSingle(),
  ]);

  const priceRows = mapServicePriceRows(pricesRes.data ?? []);
  const stable = mergeServicesWithPricesStable(svcLoad.rows, priceRows);
  const uiPrices = consolidatePriceRowsForUi(stable.prices);
  const services = mapCatalogToServicePackages(stable.services, uiPrices);
  const deals = parseDealConfig(dealRes.data?.value ?? null);
  const fleetMap = new Map((fleetRes.data ?? []).map((r) => [String((r as { key: string }).key), (r as { value: unknown }).value]));
  const fleetEnabled = String(fleetMap.get('fleet_services_enabled') ?? '').toLowerCase() === 'true';
  const fleetBlurb = String(fleetMap.get('fleet_services_blurb') ?? '').trim();

  const avail = parseBookingAvailabilityConfig(availRes.data?.value ?? null);
  void avail;
  const availabilityNote =
    'We book mobile details by appointment through our online scheduler. For exact open slots, use the booking flow — I will not guess availability without checking the live calendar.';

  const multi = computeMultiCarExample(services, deals);
  const firstTimeDiscountNote = multi
    ? `Multi-vehicle savings: second vehicle on the same visit can save about ${multi.discountPercent}% when configured in our current deals.`
    : 'Ask about first-time and multi-vehicle promotions at booking — offers vary by season.';

  return {
    services,
    deals,
    fleetEnabled,
    fleetBlurb,
    serviceArea: SERVICE_AREA,
    availabilityNote,
    firstTimeDiscountNote,
    membershipNote: 'Membership plans offer recurring maintenance pricing — see /memberships for current tiers and benefits.',
    depositNote:
      'Online booking may require a deposit to hold your slot. Final balance is typically collected after service. Exact amounts show at checkout before you pay.',
  };
}

function priceRange(services: ServicePackage[]): string {
  const prices = services
    .map((s) => s.suvTruckPrice ?? s.sedanPrice ?? s.truckPrice ?? s.suvPrice)
    .filter((p): p is number => typeof p === 'number' && p > 0);
  if (!prices.length) {
    return 'Pricing varies by vehicle size and package. I can get your info to the Gloss Boss team for an accurate quote.';
  }
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return `Most packages start around $${min.toFixed(0)}–$${max.toFixed(0)} depending on vehicle size and service level. Exact pricing shows when you build your booking.`;
}

function matchQuestion(q: string): string {
  return q.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function answerSiteGuideQuestion(admin: SupabaseClient, question: string): Promise<SiteGuideReply> {
  const ctx = await loadContext(admin);
  const q = matchQuestion(question);

  const links = (items: SiteGuideLink[]) => items;

  if (/quote|price|cost|how much|pricing/.test(q)) {
    return {
      questionKey: 'pricing',
      message: `${priceRange(ctx.services)}\n\n${ctx.firstTimeDiscountNote}\n\nWant me to help you get a quote?`,
      links: links([
        { label: 'Book online', href: '/book' },
        { label: 'View services', href: '/services' },
      ]),
      suggestLeadCapture: 'quote',
    };
  }

  if (/service|package|offer|what do you|detail/.test(q)) {
    const names = ctx.services.slice(0, 6).map((s) => s.title).filter(Boolean);
    return {
      questionKey: 'services',
      message: `Gloss Boss offers mobile detailing packages${names.length ? ` including ${names.join(', ')}` : ''}. Everything is done at your location.`,
      links: links([
        { label: 'View services', href: '/services' },
        { label: 'Book a detail', href: '/book' },
      ]),
    };
  }

  if (/area|location|city|round rock|georgetown|pflugerville|austin|service/.test(q)) {
    return {
      questionKey: 'service_area',
      message: ctx.serviceArea,
      links: links([{ label: 'Contact Gloss Boss', href: '/#contact' }]),
    };
  }

  if (/availab|schedule|book|appointment|when can/.test(q)) {
    return {
      questionKey: 'availability',
      message: ctx.availabilityNote,
      links: links([{ label: 'Book a detail', href: '/book' }]),
      suggestLeadCapture: 'quote',
    };
  }

  if (/water|power|electric|outlet|hose/.test(q)) {
    return {
      questionKey: 'water_power',
      message:
        "We are a mobile service and typically need access to water and power at the job site (or arrangements made in advance). If you are unsure about your setup, tell us your situation and we will confirm before your appointment.",
      links: links([{ label: 'Contact Gloss Boss', href: '/#contact' }]),
    };
  }

  if (/first.time|discount|promo|deal/.test(q)) {
    return {
      questionKey: 'discount',
      message: ctx.firstTimeDiscountNote,
      links: links([
        { label: 'Book a detail', href: '/book' },
        { label: 'View services', href: '/services' },
      ]),
    };
  }

  if (/member|subscription|monthly|maintenance plan/.test(q)) {
    return {
      questionKey: 'membership',
      message: ctx.membershipNote,
      links: links([{ label: 'See memberships', href: '/memberships' }]),
    };
  }

  if (/fleet|business|commercial|company|corporate/.test(q)) {
    return {
      questionKey: 'fleet',
      message: ctx.fleetEnabled
        ? ctx.fleetBlurb || 'We offer fleet and commercial programs with volume pricing. Tell us your fleet size for a custom quote.'
        : "Fleet programs may be available — share your business details and we will follow up.",
      links: links([
        { label: 'Fleet services', href: '/fleet' },
        { label: 'Get a quote', href: '/fleet' },
      ]),
      suggestLeadCapture: 'quote',
    };
  }

  if (/book|deposit|pay|payment|checkout/.test(q)) {
    return {
      questionKey: 'booking',
      message: `Booking is online and mobile-first: pick your package, vehicle, and time. ${ctx.depositNote}`,
      links: links([{ label: 'Book now', href: '/book' }]),
    };
  }

  if (/long|take|hours|duration|how long/.test(q)) {
    return {
      questionKey: 'duration',
      message:
        'Most details run roughly 2–5 hours depending on package, vehicle size, and condition. Full corrections and ceramic work can take longer. Your confirmation will reflect the package you choose.',
      links: links([{ label: 'View services', href: '/services' }]),
    };
  }

  if (/gallery|before|after|photo|result/.test(q)) {
    return {
      questionKey: 'gallery',
      message: 'See real Gloss Boss transformations in our before & after gallery.',
      links: links([{ label: 'View gallery', href: '/gallery' }]),
    };
  }

  if (/contact|call|text|email|kyle|human|person/.test(q)) {
    return {
      questionKey: 'contact',
      message: "Tell me what you need and I will point you in the right direction — or request a call from the Gloss Boss team.",
      links: links([{ label: 'Contact form', href: '/#contact' }]),
      suggestLeadCapture: 'handoff',
    };
  }

  return {
    questionKey: 'general',
    message:
      "Tell me what you need and I will point you in the right direction. I can help with services, pricing ranges, service area, memberships, fleet programs, and booking.",
    links: links([
      { label: 'Book a detail', href: '/book' },
      { label: 'View services', href: '/services' },
    ]),
  };
}

export async function createWidgetLead(
  admin: SupabaseClient,
  input: {
    name: string;
    email?: string;
    phone?: string;
    vehicle?: string;
    serviceNeeded?: string;
    city?: string;
    preferredDate?: string;
    notes?: string;
    highPriority?: boolean;
  },
): Promise<{ ok: boolean; leadId?: string; error?: string }> {
  const now = new Date().toISOString();
  const noteParts = [
    input.serviceNeeded ? `Service: ${input.serviceNeeded}` : '',
    input.city ? `City: ${input.city}` : '',
    input.preferredDate ? `Preferred date: ${input.preferredDate}` : '',
    input.highPriority ? '🔥 Kyle handoff requested' : '',
    input.notes ?? '',
    'Source: Titan Site Guide widget',
  ].filter(Boolean);

  const { data, error } = await admin
    .from('leads')
    .insert({
      name: input.name.trim() || 'Website visitor',
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      vehicle: input.vehicle?.trim() || null,
      address: input.city?.trim() || null,
      notes: noteParts.join('\n'),
      lead_source: 'titan_site_widget',
      marketing_channel: 'titan_widget',
      status: input.highPriority ? 'new' : 'new',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  const { logTitanActivity } = await import('@/lib/titan/activity-feed');
  await logTitanActivity(admin, {
    kind: 'lead_discovered',
    title: input.highPriority ? 'Kyle handoff — site widget' : 'Lead from Titan Site Guide',
    detail: `${input.name} · ${input.serviceNeeded ?? 'quote request'}`,
    href: '/admin/leads',
  });

  return { ok: true, leadId: data?.id ? String(data.id) : undefined };
}

export type WidgetStats = {
  opens: number;
  questions: number;
  leadsCreated: number;
  quoteRequests: number;
  bookingClicks: number;
  handoffs: number;
  topQuestions: { key: string; count: number }[];
  tablesReady: boolean;
};

export async function loadWidgetStats(admin: SupabaseClient, sinceIso?: string): Promise<WidgetStats> {
  const since = sinceIso ?? new Date(Date.now() - 30 * 86400000).toISOString();
  const probe = await admin.from('titan_widget_events').select('id').limit(1);
  if (probe.error) {
    return {
      opens: 0,
      questions: 0,
      leadsCreated: 0,
      quoteRequests: 0,
      bookingClicks: 0,
      handoffs: 0,
      topQuestions: [],
      tablesReady: false,
    };
  }

  const { data } = await admin.from('titan_widget_events').select('event_type, question_key').gte('created_at', since);

  const counts = {
    open: 0,
    question: 0,
    lead_created: 0,
    quote_request: 0,
    booking_click: 0,
    handoff: 0,
  };
  const qMap = new Map<string, number>();

  for (const row of data ?? []) {
    const r = row as { event_type?: string; question_key?: string };
    const t = String(r.event_type ?? '');
    if (t in counts) counts[t as keyof typeof counts] += 1;
    if (r.question_key) qMap.set(r.question_key, (qMap.get(r.question_key) ?? 0) + 1);
  }

  const topQuestions = [...qMap.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    opens: counts.open,
    questions: counts.question,
    leadsCreated: counts.lead_created,
    quoteRequests: counts.quote_request,
    bookingClicks: counts.booking_click,
    handoffs: counts.handoff,
    topQuestions,
    tablesReady: true,
  };
}

export async function trackWidgetEvent(
  admin: SupabaseClient,
  event: {
    eventType: 'open' | 'question' | 'lead_created' | 'quote_request' | 'booking_click' | 'handoff' | 'action_click';
    sessionId?: string;
    questionKey?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const probe = await admin.from('titan_widget_events').select('id').limit(1);
  if (probe.error) return;

  await admin.from('titan_widget_events').insert({
    event_type: event.eventType,
    session_id: event.sessionId ?? null,
    question_key: event.questionKey ?? null,
    metadata: event.metadata ?? {},
  });
}

export function siteGuideWelcome(): SiteGuideReply {
  return {
    message:
      "Tell me what you need and I will point you in the right direction.\n\nGloss Boss currently services Round Rock, Pflugerville, Georgetown, Wells Branch, Hutto, and nearby Austin areas.",
    links: [
      { label: 'Book a detail', href: '/book' },
      { label: 'View services', href: '/services' },
    ],
  };
}

export { getBusinessHomeBaseAddress };
