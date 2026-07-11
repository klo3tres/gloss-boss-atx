/**
 * Repair common UTF-8 mojibake sequences that appear when em-dashes and arrows
 * are decoded with the wrong charset (e.g. â€” → —, â†’ → →).
 */

const MOJIBAKE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/â€”/g, '—'], // em dash
  [/â€“/g, '–'], // en dash
  [/â€˜/g, '\u2018'], // left single quote
  [/â€™/g, '\u2019'], // right single quote
  [/â€œ/g, '\u201C'], // left double quote
  [/â€/g, '\u201D'], // right double quote
  [/â€¦/g, '…'], // ellipsis
  [/â†’/g, '→'], // right arrow
  [/â†/g, '←'], // left arrow
  [/Â /g, ' '], // non-breaking space artifact
  [/Â·/g, '·'],
];

export function repairMojibake(input: string): string {
  if (!input) return input;
  let out = input;
  for (const [pattern, replacement] of MOJIBAKE_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/** True when the string contains known mojibake patterns. */
export function hasMojibake(input: string): boolean {
  if (!input) return false;
  return MOJIBAKE_REPLACEMENTS.some(([pattern]) => pattern.test(input));
}

export const MOJIBAKE_SAMPLE_PATTERNS = [
  'â€”',
  'â€“',
  'â€˜',
  'â€™',
  'â€œ',
  'â€',
  'â€¦',
  'â†’',
  'â†',
] as const;
