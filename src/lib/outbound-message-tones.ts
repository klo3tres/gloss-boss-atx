export type MessageTone = 'quick' | 'professional' | 'warm';

export const MESSAGE_TONE_LABELS: Record<MessageTone, string> = {
  quick: 'Quick',
  professional: 'Professional',
  warm: 'Warm',
};

/** Build three owner-safe SMS variants from a base outreach message. */
export function buildToneVariants(base: string, ctx?: { name?: string; price?: string; bookLink?: string }) {
  const name = ctx?.name?.trim() || 'there';
  const price = ctx?.price?.trim();
  const link = ctx?.bookLink?.trim() || 'https://www.glossbossatx.com/book';
  const trimmed = base.trim();

  const quick =
    trimmed.length > 0 && trimmed.length < 200
      ? trimmed
      : `Gloss Boss ATX mobile detail${price ? ` from ${price}` : ''}. Book: ${link}`;

  const professional =
    trimmed.length > 0
      ? trimmed
      : `Hi ${name}, this is Gloss Boss ATX — premium mobile detailing at your location.${price ? ` Starting around ${price}.` : ''} View packages & book: ${link}`;

  const warm = `Hey ${name}! Kyle with Gloss Boss ATX — we come to you for pro mobile detailing.${price ? ` Packages from ${price}.` : ''} Happy to answer questions or find a time: ${link}`;

  return { quick, professional, warm };
}
