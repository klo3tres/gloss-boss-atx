import type { LeadRadarSourceType } from '@/lib/titan/lead-radar-engine';

export type ParsedSocialLead = {
  rawText: string;
  authorName: string | null;
  sourceType: LeadRadarSourceType | string;
  sourceName: string | null;
  sourceUrl: string | null;
  locationText: string | null;
  phone: string | null;
  email: string | null;
  platformHint: string | null;
};

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const PHONE_RE = /(?:\+1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const LOCATION_RE = /\b(?:Austin|Round Rock|Pflugerville|Georgetown|Cedar Park|Leander|Hutto|Taylor|Manor|Buda|Kyle|San Marcos|TX|Texas)\b/i;

function detectPlatform(text: string, url: string | null): { sourceType: string; sourceName: string | null } {
  const hay = `${text} ${url ?? ''}`.toLowerCase();
  if (/facebook\.com|fb\.com|m\.facebook/.test(hay)) {
    const group = text.match(/(?:group|posted in)[:\s]+([^\n]+)/i)?.[1]?.trim();
    return { sourceType: /comment/.test(hay) ? 'facebook_comment' : 'facebook_group', sourceName: group ?? 'Facebook' };
  }
  if (/nextdoor\.com/.test(hay)) return { sourceType: 'nextdoor', sourceName: 'Nextdoor' };
  if (/reddit\.com|\/r\//.test(hay)) {
    const sub = text.match(/\/r\/([a-zA-Z0-9_]+)/)?.[1];
    return { sourceType: 'reddit', sourceName: sub ? `r/${sub}` : 'Reddit' };
  }
  if (/instagram\.com|instagr\.am/.test(hay)) return { sourceType: 'instagram_comment', sourceName: 'Instagram' };
  if (/craigslist\.org/.test(hay)) return { sourceType: 'craigslist', sourceName: 'Craigslist' };
  return { sourceType: 'manual', sourceName: null };
}

function extractAuthorName(text: string): string | null {
  const patterns = [
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:said|asked|posted|wrote)/m,
    /^(?:Posted by|Author|From)[:\s]+([^\n]+)/im,
    /^@?([A-Za-z][A-Za-z0-9._-]{2,24})\s*:/m,
    /^([A-Z][a-z]+)\s*·/m,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const name = m[1].trim().replace(/^@/, '');
      if (name.length >= 2 && name.length <= 40 && !/http|www|detail/i.test(name)) return name;
    }
  }
  return null;
}

export function parseMessySocialText(raw: string, defaultSourceType = 'manual'): ParsedSocialLead {
  const text = raw.trim();
  const urls = text.match(URL_RE) ?? [];
  const sourceUrl = urls[0] ?? null;
  const phone = text.match(PHONE_RE)?.[0]?.replace(/\D/g, '').length === 10
    ? text.match(PHONE_RE)?.[0] ?? null
    : text.match(PHONE_RE)?.[0] ?? null;
  const email = text.match(EMAIL_RE)?.[0] ?? null;
  const locationMatch = text.match(LOCATION_RE);
  const platform = detectPlatform(text, sourceUrl);
  const authorName = extractAuthorName(text);

  let body = text;
  if (sourceUrl) body = body.replace(sourceUrl, '').trim();
  if (phone) body = body.replace(phone, '').trim();
  if (email) body = body.replace(email, '').trim();

  return {
    rawText: body || text,
    authorName,
    sourceType: platform.sourceType !== 'manual' ? platform.sourceType : defaultSourceType,
    sourceName: platform.sourceName,
    sourceUrl,
    locationText: locationMatch?.[0] ?? null,
    phone,
    email,
    platformHint: platform.sourceName,
  };
}

export function splitMessyImportBlock(rawBlock: string): string[] {
  return rawBlock
    .split(/\n\s*---+\s*\n|\n\s*\n/)
    .map((c) => c.trim())
    .filter((c) => c.length > 12);
}
