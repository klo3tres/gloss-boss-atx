/** Titan™ product branding — AI Business Operator, not a CRM. */

export const TITAN_PRODUCT_NAME = 'Titan';
export const TITAN_PRODUCT_TAGLINE = 'AI Business Operator';
export const TITAN_TAGLINE = 'Business Development Department';
export const TITAN_MISSION =
  'Create revenue. Recover revenue. Increase revenue. Everything else is secondary.';

export const TITAN_ENGINES = {
  revenueMission: 'Titan Revenue Mission Engine™',
  acquisition: 'Titan Acquisition Engine™',
  partner: 'Titan Partner Engine™',
  recovery: 'Titan Revenue Recovery Engine™',
  experiment: 'Titan Experiment Engine™',
  opportunityGraph: 'Titan Opportunity Graph™',
  dailyBriefing: 'Titan Daily Briefing™',
  weeklyMission: 'Titan Weekly Mission™',
  scoreboard: 'Titan Scoreboard™',
  outreach: 'Titan Outreach Engine™',
  goal: 'Titan Goal Engine™',
  referral: 'Titan Referral Engine™',
  territoryDomination: 'Titan Territory Domination™',
  content: 'Titan Content Engine™',
  fleet: 'Titan Fleet Engine™',
  dealRoom: 'Titan Deal Room™',
  revenueForecast: 'Titan Revenue Forecast™',
  dailyAutonomy: 'Titan Daily Manager™',
  attribution: 'Titan Attribution Engine™',
  acquisitionSources: 'Titan Acquisition Sources™',
  learning: 'Titan Learning Engine™',
  touchSchedule: 'Titan Follow-Up Cadence™',
  jobCloseout: 'Titan Job Closeout™',
  offers: 'Titan Offer Builder™',
  onboarding: 'Titan Onboarding™',
  billing: 'Titan Billing™',
  demo: 'Titan Demo Mode™',
} as const;

export const titanColors = {
  void: '#050508',
  carbon: '#0a0a0f',
  slate: '#12121a',
  gold: '#c9a227',
  goldSoft: '#e8c547',
  goldGlow: 'rgba(201, 162, 39, 0.35)',
  cyan: '#22d3ee',
  emerald: '#34d399',
  border: 'rgba(255, 255, 255, 0.08)',
} as const;

export const titanCssVars = {
  '--titan-void': titanColors.void,
  '--titan-carbon': titanColors.carbon,
  '--titan-gold': titanColors.gold,
  '--titan-gold-soft': titanColors.goldSoft,
  '--titan-glow': titanColors.goldGlow,
} as const;

export function poweredByTitanLabel() {
  return `Powered by ${TITAN_PRODUCT_NAME}™`;
}

export function titanCommandCenterTitle() {
  return `${TITAN_PRODUCT_NAME} Command Center™`;
}
