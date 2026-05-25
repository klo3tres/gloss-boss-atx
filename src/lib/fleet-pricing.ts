export type FleetPricingConfig = {
  smallLabel: string;
  smallDetail: string;
  mediumLabel: string;
  mediumDetail: string;
  largeLabel: string;
  largeDetail: string;
  weeklyDiscount: string;
  biweeklyDiscount: string;
  monthlyDiscount: string;
  commercialNotes: string;
};

export const DEFAULT_FLEET_PRICING: FleetPricingConfig = {
  smallLabel: 'Small fleet (1–5 vehicles)',
  smallDetail: 'From $65/vehicle exterior wash',
  mediumLabel: 'Medium fleet (6–15 vehicles)',
  mediumDetail: 'From $55/vehicle exterior wash',
  largeLabel: 'Large fleet (15+ vehicles)',
  largeDetail: 'Custom quote — volume & recurring schedules',
  weeklyDiscount: '5% recurring weekly',
  biweeklyDiscount: '3% biweekly',
  monthlyDiscount: '10% monthly maintenance plan',
  commercialNotes: 'Recurring fleet maintenance, employee parking lots, water/power access — documented on site.',
};

export function parseFleetPricing(raw: unknown): FleetPricingConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FLEET_PRICING };
  const r = raw as Record<string, unknown>;
  const pick = (key: keyof FleetPricingConfig, fallback: string) => {
    const v = r[key];
    return typeof v === 'string' && v.trim() ? v.trim() : fallback;
  };
  return {
    smallLabel: pick('smallLabel', DEFAULT_FLEET_PRICING.smallLabel),
    smallDetail: pick('smallDetail', DEFAULT_FLEET_PRICING.smallDetail),
    mediumLabel: pick('mediumLabel', DEFAULT_FLEET_PRICING.mediumLabel),
    mediumDetail: pick('mediumDetail', DEFAULT_FLEET_PRICING.mediumDetail),
    largeLabel: pick('largeLabel', DEFAULT_FLEET_PRICING.largeLabel),
    largeDetail: pick('largeDetail', DEFAULT_FLEET_PRICING.largeDetail),
    weeklyDiscount: pick('weeklyDiscount', DEFAULT_FLEET_PRICING.weeklyDiscount),
    biweeklyDiscount: pick('biweeklyDiscount', DEFAULT_FLEET_PRICING.biweeklyDiscount),
    monthlyDiscount: pick('monthlyDiscount', DEFAULT_FLEET_PRICING.monthlyDiscount),
    commercialNotes: pick('commercialNotes', DEFAULT_FLEET_PRICING.commercialNotes),
  };
}
