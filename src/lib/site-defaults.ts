/** Production Google review link — used when CMS has no URL yet. */
export const DEFAULT_GOOGLE_REVIEW_URL =
  'https://www.google.com/maps/place//data=!4m3!3m2!1s0x26909ebef6d0b347:0x412df3b20f164dba!12e1?source=g.page.m.ia._&laa=nmx-review-solicitation-ia2';

export function resolveGoogleReviewUrl(cmsUrl: string): string {
  const u = cmsUrl.trim();
  if (u.startsWith('http')) return u;
  return DEFAULT_GOOGLE_REVIEW_URL;
}
