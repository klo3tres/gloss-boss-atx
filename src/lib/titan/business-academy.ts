export type AcademyResource = {
  id: string;
  title: string;
  summary: string;
  type: 'video' | 'article' | 'model' | 'tool';
  category: 'operations' | 'marketing' | 'finance' | 'ai' | 'detailing';
  href: string;
  duration?: string;
  provider?: string;
};

export type BusinessModelCard = {
  id: string;
  name: string;
  description: string;
  metrics: string[];
  glossBossFit: string;
};

export const BUSINESS_MODELS: BusinessModelCard[] = [
  {
    id: 'recurring-membership',
    name: 'Recurring membership (MRR)',
    description: 'Predictable monthly revenue from maintenance plans — your Bronze / Silver / Gold ladder.',
    metrics: ['Monthly recurring revenue', 'Churn %', 'LTV per member', 'Cost to serve per visit'],
    glossBossFit: 'Gloss Boss memberships bundle discounts, loyalty multipliers, and credits to increase visit frequency without discounting one-time jobs.',
  },
  {
    id: 'high-ticket-mobile',
    name: 'High-ticket mobile service',
    description: 'Premium per-job pricing with route density and technician utilization as levers.',
    metrics: ['Revenue per technician-hour', 'Jobs per route day', 'Average ticket', 'Repeat rate'],
    glossBossFit: 'Titan scheduling + weather signals help protect margins on mobile routes and reduce no-shows.',
  },
  {
    id: 'referral-flywheel',
    name: 'Referral flywheel',
    description: 'Happy clients become your lowest-CAC acquisition channel.',
    metrics: ['Referral conversion %', 'Reward cost per booked job', 'Viral coefficient'],
    glossBossFit: 'Your referral rewards center ties give/get incentives to booked revenue — track it in Admin → Referrals.',
  },
];

export const ACADEMY_RESOURCES: AcademyResource[] = [
  {
    id: 'yt-small-business-ops',
    title: 'Small business operations fundamentals',
    summary: 'How to systemize scheduling, follow-up, and cash collection — the backbone of a service business.',
    type: 'video',
    category: 'operations',
    href: 'https://www.youtube.com/results?search_query=small+business+operations+systems+service+business',
    duration: 'Playlist',
    provider: 'YouTube',
  },
  {
    id: 'yt-detailing-business',
    title: 'Auto detailing business growth',
    summary: 'Pricing, packages, and recurring revenue strategies specific to detailing.',
    type: 'video',
    category: 'detailing',
    href: 'https://www.youtube.com/results?search_query=auto+detailing+business+pricing+membership',
    duration: 'Playlist',
    provider: 'YouTube',
  },
  {
    id: 'yt-ai-operations',
    title: 'AI for small business operations',
    summary: 'Practical AI workflows for inbox triage, follow-ups, and revenue recovery — no hype.',
    type: 'video',
    category: 'ai',
    href: 'https://www.youtube.com/results?search_query=AI+automation+small+business+operations+2024',
    duration: 'Playlist',
    provider: 'YouTube',
  },
  {
    id: 'sba-finance',
    title: 'SBA — Manage your business finances',
    summary: 'Cash flow, pricing, and basic unit economics for service businesses.',
    type: 'article',
    category: 'finance',
    href: 'https://www.sba.gov/business-guide/manage-your-business/manage-your-finances',
    provider: 'U.S. SBA',
  },
  {
    id: 'hubspot-service-pricing',
    title: 'Service business pricing guide',
    summary: 'Value-based pricing and packaging — applies directly to detailing tiers.',
    type: 'article',
    category: 'marketing',
    href: 'https://blog.hubspot.com/sales/pricing-strategy',
    provider: 'HubSpot',
  },
  {
    id: 'stripe-recurring',
    title: 'Stripe — Recurring revenue handbook',
    summary: 'How subscriptions, trials, and dunning work under the hood (your membership checkout stack).',
    type: 'article',
    category: 'finance',
    href: 'https://stripe.com/guides/recurring-revenue',
    provider: 'Stripe',
  },
  {
    id: 'model-unit-economics',
    title: 'Unit economics worksheet',
    summary: 'Revenue per job − variable cost = contribution margin. Track daily in Admin → Revenue.',
    type: 'model',
    category: 'finance',
    href: '/admin/revenue',
    provider: 'Gloss Boss',
  },
  {
    id: 'tool-titan-growth',
    title: 'Titan Growth workspace',
    summary: 'Run hunts, experiments, and outreach from one command surface.',
    type: 'tool',
    category: 'ai',
    href: '/admin/titan?workspace=growth',
    provider: 'Titan',
  },
  {
    id: 'tool-setup-center',
    title: 'Owner Setup Center',
    summary: 'Launch readiness checklist — payments, hours, social, and integrations.',
    type: 'tool',
    category: 'operations',
    href: '/admin/setup-center',
    provider: 'Gloss Boss',
  },
];

export const ACADEMY_CATEGORIES = [
  { id: 'all', label: 'All topics' },
  { id: 'operations', label: 'Operations' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'finance', label: 'Finance' },
  { id: 'ai', label: 'AI & Titan' },
  { id: 'detailing', label: 'Detailing' },
] as const;
