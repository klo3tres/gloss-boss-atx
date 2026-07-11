export type MessageTone = 'quick' | 'professional' | 'warm';

export const MESSAGE_TONE_LABELS: Record<MessageTone, string> = {
  quick: 'Quick',
  professional: 'Professional',
  warm: 'Warm',
};

export type ToneContext = {
  name?: string;
  price?: string;
  bookLink?: string;
  vehicle?: string;
  service?: string;
  businessName?: string;
  balance?: string;
  paymentUrl?: string;
};

/** Build three unique owner-safe variants from a base contextual message. */
export function buildToneVariants(base: string, ctx?: ToneContext) {
  const name = ctx?.name?.trim() || 'there';
  const price = ctx?.price?.trim();
  const link = ctx?.bookLink?.trim() || 'https://www.glossbossatx.com/book';
  const vehicle = ctx?.vehicle?.trim() || 'your vehicle';
  const service = ctx?.service?.trim()?.replace(/-/g, ' ') || 'detail';
  const biz = ctx?.businessName?.trim();
  const balance = ctx?.balance?.trim();
  const pay = ctx?.paymentUrl?.trim();
  const trimmed = base.trim();

  const quick = (() => {
    if (pay && balance) return `Hi ${name} — balance ${balance} for ${vehicle}. Pay: ${pay}`;
    if (biz) return `Kyle @ Gloss Boss — fleet detailing for ${biz}. Quick quote?`;
    if (trimmed.length > 0 && trimmed.length <= 180) return trimmed;
    return `Gloss Boss ATX ${service} for ${vehicle}${price ? ` from ${price}` : ''}. Book: ${link}`;
  })();

  const professional = (() => {
    if (pay && balance) {
      return `Hi ${name}, this is Gloss Boss ATX. Your remaining balance of ${balance} for ${vehicle} is ready. Secure payment: ${pay}`;
    }
    if (biz) {
      return `Hello — Kyle with Gloss Boss ATX. We provide on-site fleet and lot detailing in Austin. I'd like to send a quote for ${biz}. Who handles vehicle care on your team?`;
    }
    if (trimmed.length > 40) return trimmed;
    return `Hi ${name}, this is Gloss Boss ATX — premium mobile ${service} at your location for ${vehicle}.${price ? ` Packages from ${price}.` : ''} Book: ${link}`;
  })();

  const warm = (() => {
    if (pay && balance) {
      return `Hey ${name}! Hope ${vehicle} is still looking sharp. Quick reminder — ${balance} left on your Gloss Boss invoice. Easy pay link: ${pay}`;
    }
    if (biz) {
      return `Hey — Kyle with Gloss Boss ATX. Saw ${biz} and thought a mobile fleet wash day could save your team time. Want a no-pressure quote?`;
    }
    return `Hey ${name}! Kyle with Gloss Boss ATX — we come to you for ${service} on ${vehicle}.${price ? ` From ${price}.` : ''} Happy to find a time that works: ${link}`;
  })();

  return { quick, professional, warm };
}
