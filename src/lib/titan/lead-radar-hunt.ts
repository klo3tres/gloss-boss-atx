import type { SupabaseClient } from '@supabase/supabase-js';

export type LeadPlaybook = {
  id: string;
  title: string;
  platform: string;
  searchQuery: string;
  targetCustomer: string | null;
  intentToFind: string | null;
  examplePhrases: string[];
  suggestedAction: string | null;
  estimatedRevenueMin: number;
  estimatedRevenueMax: number;
  priority: number;
};

export type HuntCategoryId =
  | 'warm_people'
  | 'social_demand'
  | 'local_business'
  | 'search_prospects'
  | 'community';

export type HuntCategory = {
  id: HuntCategoryId;
  title: string;
  description: string;
  whatToSearch: string[];
  whereToSearch: string[];
  pasteHint: string;
  revenueRange: string;
  effort: 'low' | 'medium' | 'high';
  urgency: 'high' | 'medium' | 'low';
  suggestedReply: string;
};

export const HUNT_CATEGORIES: HuntCategory[] = [
  {
    id: 'warm_people',
    title: 'Warm People',
    description: 'People who already know you or asked before — fastest path to a booking this weekend.',
    whatToSearch: ['Canceled customers', 'Coworkers', 'Nurses', 'Previous customers', 'Referrals', 'Saturday interior lead'],
    whereToSearch: ['Your phone contacts', 'Opportunity Board', 'Canceled appointments in admin', 'Past DMs'],
    pasteHint: 'Paste any warm conversation into Lead Radar or add directly on Opportunity Board.',
    revenueRange: '$125–$250',
    effort: 'low',
    urgency: 'high',
    suggestedReply: 'Hey [Name], I had an opening come up this weekend for an interior detail — want me to lock you in before I offer it out?',
  },
  {
    id: 'social_demand',
    title: 'Social Demand',
    description: 'People actively asking for a detailer in groups and comments.',
    whatToSearch: ['who does car detailing', 'need interior cleaned', 'ISO mobile detailer', 'stain removal seats'],
    whereToSearch: ['Facebook groups', 'Nextdoor', 'Reddit r/Austin', 'Instagram comments'],
    pasteHint: 'Copy the full post + comment thread into Lead Radar paste box.',
    revenueRange: '$125–$275',
    effort: 'medium',
    urgency: 'high',
    suggestedReply: 'Hey [Name], I run Gloss Boss ATX — mobile detailing in Austin/Round Rock. Happy to send pricing and openings this week.',
  },
  {
    id: 'local_business',
    title: 'Local Business Prospects',
    description: 'B2B repeat revenue — apartments, fleets, dealerships, property managers.',
    whatToSearch: ['apartment complex', 'property management', 'used car dealer', 'fleet service', 'office park'],
    whereToSearch: ['Google Maps', 'Google Places scan in Lead Radar', 'LinkedIn', 'Cold call list'],
    pasteHint: 'Run Google Places scan or paste business name + address from Maps.',
    revenueRange: '$800–$8,000/mo potential',
    effort: 'high',
    urgency: 'medium',
    suggestedReply: "Hi, I'm Kyle with Gloss Boss ATX. We offer mobile fleet/apartment detailing — who handles vehicle cleaning for your team?",
  },
  {
    id: 'search_prospects',
    title: 'Search-Based Prospects',
    description: 'Google Places + search queries + competitor review angles.',
    whatToSearch: ['apartment complexes Round Rock', 'fleet companies Austin', 'marinas near Austin'],
    whereToSearch: ['Google search', 'Google Maps', 'Lead Radar playbooks', 'Competitor review tool'],
    pasteHint: 'Use playbook Search Google buttons, then Capture Result after contact.',
    revenueRange: '$500–$5,000',
    effort: 'medium',
    urgency: 'medium',
    suggestedReply: 'Use B2B script from Outreach Scripts for property/fleet targets.',
  },
  {
    id: 'community',
    title: 'Community Prospecting',
    description: 'Car clubs, Tesla/BMW groups, hospital networks, neighborhood groups.',
    whatToSearch: ['BMW Austin group', 'Tesla Austin', 'car club detail', 'hospital employee network'],
    whereToSearch: ['Facebook groups', 'Reddit', 'Instagram', 'Word of mouth'],
    pasteHint: 'Paste group posts or member requests into Lead Radar.',
    revenueRange: '$175–$500',
    effort: 'medium',
    urgency: 'high',
    suggestedReply: 'Hey — Kyle with Gloss Boss ATX. We do mobile premium details for [club/group]. Want a group rate for members?',
  },
];

export const RECENCY_GUIDANCE = [
  'Search posts from Today first',
  'Then Past 7 days',
  'Then Past 14 days',
  'Still worth replying if no strong answer was given',
];

export type HuntSource = {
  id: string;
  title: string;
  whyItMatters: string;
  whatToSearch: string[];
  whatToPaste: string;
  messageAngle: string;
  expectedValue: string;
  effort: 'low' | 'medium' | 'high';
  urgency: 'high' | 'medium' | 'low';
};

export const WHERE_TO_HUNT_SOURCES: HuntSource[] = [
  { id: 'warm', title: 'Coworkers / nurses / warm contacts', whyItMatters: 'Fastest path to a booking — they already trust you.', whatToSearch: ['canceled customers', 'previous customers', 'referrals'], whatToPaste: 'Paste warm text thread into Lead Radar', messageAngle: 'Personal opening + specific weekend slot', expectedValue: '$125–$250', effort: 'low', urgency: 'high' },
  { id: 'facebook', title: 'Facebook local groups', whyItMatters: 'People actively ask for detailers daily.', whatToSearch: ['who does mobile detailing', 'need car detailed', 'interior car cleaning'], whatToPaste: 'Full post + comments from group search', messageAngle: 'Helpful reply — mobile Austin/Round Rock', expectedValue: '$125–$275', effort: 'medium', urgency: 'high' },
  { id: 'nextdoor', title: 'Nextdoor', whyItMatters: 'Hyper-local buyers with high intent.', whatToSearch: ['car detailer', 'mobile detailing', 'car wash recommendation'], whatToPaste: 'Neighbor post + your reply draft', messageAngle: 'Neighbor trust + come to you', expectedValue: '$125–$250', effort: 'medium', urgency: 'high' },
  { id: 'google_b2b', title: 'Google Places B2B', whyItMatters: 'Repeat fleet/apartment revenue.', whatToSearch: ['apartment complexes Round Rock', 'property management Austin', 'fleet companies'], whatToPaste: 'Business name + address from Maps', messageAngle: 'B2B partnership / resident detail day', expectedValue: '$800–$8,000/mo', effort: 'high', urgency: 'medium' },
  { id: 'apartments', title: 'Apartment complexes', whyItMatters: 'Resident detail days = volume.', whatToSearch: ['apartment complex Round Rock', 'multifamily Austin'], whatToPaste: 'Property name from Google Maps', messageAngle: 'Resident mobile detail event', expectedValue: '$500–$3,000', effort: 'high', urgency: 'medium' },
  { id: 'fleet', title: 'Fleet businesses', whyItMatters: 'Recurring on-site revenue.', whatToSearch: ['fleet service Austin', 'trucking company Round Rock'], whatToPaste: 'Company name + contact if found', messageAngle: 'Mobile fleet — no downtime', expectedValue: '$800–$5,000/mo', effort: 'high', urgency: 'medium' },
  { id: 'dealerships', title: 'Dealerships', whyItMatters: 'Lot-ready inventory detailing.', whatToSearch: ['used car dealer Round Rock', 'car dealer Austin'], whatToPaste: 'Dealer name + decision maker if known', messageAngle: 'Photo-ready lot inventory', expectedValue: '$500–$4,000', effort: 'high', urgency: 'low' },
  { id: 'car_clubs', title: 'Car clubs (BMW/Tesla/etc.)', whyItMatters: 'Premium buyers + group rates.', whatToSearch: ['BMW Austin group', 'Tesla Austin club'], whatToPaste: 'Club post or member request', messageAngle: 'Member group rate for meets', expectedValue: '$175–$500', effort: 'medium', urgency: 'high' },
  { id: 'reddit', title: 'Reddit local threads', whyItMatters: 'Buyers researching detailers.', whatToSearch: ['Austin car detailing', 'Round Rock car wash'], whatToPaste: 'Thread text into Lead Radar', messageAngle: 'Helpful non-spam local reply', expectedValue: '$125–$250', effort: 'medium', urgency: 'medium' },
  { id: 'winback', title: 'Canceled / previous customers', whyItMatters: 'Already sold — easy reschedule.', whatToSearch: ['canceled appointments', 'past customers 90 days'], whatToPaste: 'CRM note or message thread', messageAngle: 'No-pressure reschedule offer', expectedValue: '$150–$275', effort: 'low', urgency: 'high' },
];

export const TODAYS_EXACT_HUNT_PLAN = [
  'Text 3 warm leads',
  'Search 3 buyer-intent phrases (Today → 7 days → 14 days)',
  'Paste 5 posts/comments into Lead Radar',
  'Run Google Places prospect scan',
  'Contact 3 B2B prospects',
  'Post one weekend opening',
  'Ask one previous customer for referral',
];

export const DAILY_HUNT_TASK_DEFS = [
  { taskKey: 'text_warm_leads', label: 'Text warm leads' },
  { taskKey: 'search_facebook_groups', label: 'Search 3 Facebook groups' },
  { taskKey: 'paste_leads', label: 'Paste 5 posts/comments into Lead Radar' },
  { taskKey: 'run_google_places', label: 'Run Google Places prospect scan' },
  { taskKey: 'contact_b2b', label: 'Contact 3 B2B prospects' },
  { taskKey: 'post_weekend_opening', label: 'Post weekend opening' },
  { taskKey: 'ask_referral', label: 'Ask 1 completed customer for referral' },
  { taskKey: 'review_followups', label: 'Review follow-ups due' },
] as const;

export function buildSearchUrls(platform: string, query: string) {
  const q = encodeURIComponent(query);
  const google = `https://www.google.com/search?q=${q}`;
  const facebook = `https://www.facebook.com/search/top?q=${q}`;
  const nextdoor = `https://nextdoor.com/search/?query=${q}`;
  const reddit = `https://www.reddit.com/search/?q=${q}`;
  return { google, facebook, nextdoor, reddit, query };
}

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function isMissingTable(message: string) {
  return /titan_lead_playbook|schema cache|does not exist/i.test(message);
}

export async function loadLeadPlaybooks(admin: SupabaseClient, workspaceKey = 'default'): Promise<{ playbooks: LeadPlaybook[]; tablesReady: boolean }> {
  const { data, error } = await admin
    .from('titan_lead_playbooks')
    .select('*')
    .eq('workspace_key', workspaceKey)
    .order('priority', { ascending: false })
    .limit(100);

  if (error) {
    if (isMissingTable(error.message)) return { playbooks: [], tablesReady: false };
    return { playbooks: [], tablesReady: true };
  }

  return {
    tablesReady: true,
    playbooks: (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: str(row.id),
        title: str(row.title),
        platform: str(row.platform),
        searchQuery: str(row.search_query),
        targetCustomer: str(row.target_customer) || null,
        intentToFind: str(row.intent_to_find) || null,
        examplePhrases: Array.isArray(row.example_phrases) ? row.example_phrases.map(String) : [],
        suggestedAction: str(row.suggested_action) || null,
        estimatedRevenueMin: Number(row.estimated_revenue_min ?? 0),
        estimatedRevenueMax: Number(row.estimated_revenue_max ?? 0),
        priority: Number(row.priority ?? 50),
      };
    }),
  };
}

export async function loadDailyHuntTasks(admin: SupabaseClient, workspaceKey = 'default', date = new Date()) {
  const taskDate = date.toISOString().slice(0, 10);
  const probe = await admin.from('titan_daily_hunt_tasks').select('id').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) {
    return { tasks: DAILY_HUNT_TASK_DEFS.map((d) => ({ ...d, completed: false, id: null as string | null })), tablesReady: false };
  }

  const { data } = await admin
    .from('titan_daily_hunt_tasks')
    .select('id, task_key, label, completed_at')
    .eq('workspace_key', workspaceKey)
    .eq('task_date', taskDate);

  const byKey = new Map((data ?? []).map((r) => [str((r as { task_key?: string }).task_key), r as Record<string, unknown>]));

  return {
    tablesReady: true,
    taskDate,
    tasks: DAILY_HUNT_TASK_DEFS.map((d) => {
      const row = byKey.get(d.taskKey);
      return {
        ...d,
        id: row ? str(row.id) : null,
        completed: Boolean(row?.completed_at),
      };
    }),
  };
}

export async function toggleDailyHuntTask(
  admin: SupabaseClient,
  taskKey: string,
  completed: boolean,
  workspaceKey = 'default',
  date = new Date(),
) {
  const taskDate = date.toISOString().slice(0, 10);
  const def = DAILY_HUNT_TASK_DEFS.find((d) => d.taskKey === taskKey);
  if (!def) return { ok: false, error: 'Unknown task' };

  const { data: existing } = await admin
    .from('titan_daily_hunt_tasks')
    .select('id')
    .eq('workspace_key', workspaceKey)
    .eq('task_date', taskDate)
    .eq('task_key', taskKey)
    .maybeSingle();

  const now = new Date().toISOString();
  if (existing?.id) {
    const { error } = await admin
      .from('titan_daily_hunt_tasks')
      .update({ completed_at: completed ? now : null })
      .eq('id', existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin.from('titan_daily_hunt_tasks').insert({
      workspace_key: workspaceKey,
      task_date: taskDate,
      task_key: taskKey,
      label: def.label,
      completed_at: completed ? now : null,
      created_at: now,
    });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type ConversionGoalStats = {
  leadsCapturedToday: number;
  repliesSentToday: number;
  opportunitiesCreatedToday: number;
  bookingsToday: number;
  nextBestAction: string;
};

export async function loadConversionGoalStats(admin: SupabaseClient, workspaceKey = 'default'): Promise<ConversionGoalStats> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const since = start.toISOString();

  const [leads, replies, opps, bookings] = await Promise.all([
    admin.from('titan_lead_radar_items').select('id', { count: 'exact', head: true }).gte('created_at', since),
    admin.from('titan_lead_radar_events').select('id', { count: 'exact', head: true }).eq('event_type', 'replied').gte('created_at', since),
    admin.from('titan_opportunities').select('id', { count: 'exact', head: true }).gte('created_at', since),
    admin.from('appointments').select('id', { count: 'exact', head: true }).gte('created_at', since).in('status', ['confirmed', 'scheduled', 'booked', 'pending']),
  ]);

  const leadsCapturedToday = leads.count ?? 0;
  const repliesSentToday = replies.error ? 0 : replies.count ?? 0;
  const opportunitiesCreatedToday = opps.count ?? 0;
  const bookingsToday = bookings.error ? 0 : bookings.count ?? 0;

  let nextBestAction = 'Seed warm leads on Opportunity Board and text your top 3.';
  if (leadsCapturedToday === 0) nextBestAction = 'Paste 3 Facebook/Nextdoor posts into Lead Radar now.';
  else if (repliesSentToday === 0) nextBestAction = 'Copy a recommended reply and send to your highest-confidence lead.';
  else if (opportunitiesCreatedToday === 0) nextBestAction = 'Convert your best radar lead to the Opportunity Board.';
  else if (bookingsToday === 0) nextBestAction = 'Follow up on open opportunities — offer a specific day/time.';

  return { leadsCapturedToday, repliesSentToday, opportunitiesCreatedToday, bookingsToday, nextBestAction };
}
