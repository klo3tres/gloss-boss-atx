/** Titan™ product branding — color system, naming, iconography tokens. */

export const TITAN_PRODUCT_NAME = 'Titan';
export const TITAN_TAGLINE = 'Operating System for Service Businesses';

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
