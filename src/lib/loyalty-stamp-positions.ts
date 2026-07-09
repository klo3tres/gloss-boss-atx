/**
 * Percent positions for punch overlays on the Gloss Boss loyalty card BACK artwork.
 * Calibrate against the full card image (object-fit: contain) — not a cropped region.
 * Adjust left/top here if artwork changes; stamps use translate(-50%, -50%).
 */
export const LOYALTY_CARD_ASPECT = 3.5 / 2;

export type LoyaltyStampPosition = {
  left: string;
  top: string;
  size?: string;
};

/** Five punch boxes + reward slot (6th) — left-to-right on standard card art */
export const LOYALTY_STAMP_POSITIONS: readonly LoyaltyStampPosition[] = [
  { left: '13.5%', top: '62%', size: '10.5%' },
  { left: '27.5%', top: '62%', size: '10.5%' },
  { left: '41.5%', top: '62%', size: '10.5%' },
  { left: '55.5%', top: '62%', size: '10.5%' },
  { left: '69.5%', top: '62%', size: '10.5%' },
  { left: '83.5%', top: '62%', size: '11%' },
] as const;

export const LOYALTY_STAMP_DEFAULT_SIZE = '10.5%';
