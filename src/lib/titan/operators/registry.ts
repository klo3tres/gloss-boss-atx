export type TitanOperator = {
  id: string;
  name: string;
  purpose: string;
  href: string;
  kpiLabel: string;
  status: 'live' | 'beta' | 'planned';
};

/** Titan AI Business Operator registry — workspace-scalable operator map. */
export const TITAN_OPERATORS: TitanOperator[] = [
  {
    id: 'revenue',
    name: 'Revenue Operator',
    purpose: 'How much money can you generate today?',
    href: '/admin/titan',
    kpiLabel: 'Potential revenue today',
    status: 'live',
  },
  {
    id: 'lead',
    name: 'Lead Operator',
    purpose: 'Mission control for neighborhood hunting and warm leads.',
    href: '/admin/titan/lead-radar',
    kpiLabel: 'Leads to contact today',
    status: 'live',
  },
  {
    id: 'territory',
    name: 'Territory Tracker',
    purpose: 'Door knocking, DNR flags, and neighborhood conversion.',
    href: '/admin/titan/territory',
    kpiLabel: 'Unvisited doors nearby',
    status: 'beta',
  },
  {
    id: 'calendar',
    name: 'Calendar Operator',
    purpose: 'Scheduling, time blocks, and Google Calendar sync.',
    href: '/admin/calendar',
    kpiLabel: 'Open slots this week',
    status: 'beta',
  },
  {
    id: 'inventory',
    name: 'Inventory Operator',
    purpose: 'Track chemicals, towels, and supplies before jobs run out.',
    href: '/admin/titan/inventory',
    kpiLabel: 'Items below reorder',
    status: 'beta',
  },
  {
    id: 'finance',
    name: 'Finance Operator',
    purpose: 'Revenue, expenses, mileage, and net profit without QuickBooks.',
    href: '/admin/revenue',
    kpiLabel: 'Net profit this month',
    status: 'live',
  },
  {
    id: 'weather',
    name: 'Weather Operator',
    purpose: 'Rain windows, reschedule risk, and job readiness.',
    href: '/admin/calendar',
    kpiLabel: 'Rain risk days',
    status: 'live',
  },
  {
    id: 'reputation',
    name: 'Reputation Operator',
    purpose: 'Reviews, follow-ups, and customer retention.',
    href: '/admin/reviews',
    kpiLabel: 'Reviews to request',
    status: 'live',
  },
  {
    id: 'website',
    name: 'Website Operator',
    purpose: 'Analytics, SEO, Clarity, reviews, and booking conversion intelligence.',
    href: '/admin/titan/website-intelligence',
    kpiLabel: 'Site health',
    status: 'live',
  },
];

export function operatorById(id: string): TitanOperator | undefined {
  return TITAN_OPERATORS.find((o) => o.id === id);
}
