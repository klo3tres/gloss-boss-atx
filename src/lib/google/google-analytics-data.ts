/**
 * Optional GA4 Data API via service account (no googleapis dependency).
 */

import 'server-only';

import crypto from 'node:crypto';

export type GaTrafficMetrics = {
  periodDays: 7 | 28;
  users: number;
  sessions: number;
  views: number;
  topPages: { path: string; views: number }[];
  trafficSources: { source: string; sessions: number }[];
  conversions?: { event: string; count: number }[];
};

export type GaDataApiResult =
  | { ok: true; metrics7: GaTrafficMetrics; metrics28: GaTrafficMetrics }
  | { ok: false; error: string };

const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

function envPrivateKey(): string | null {
  const raw = process.env.GOOGLE_ANALYTICS_PRIVATE_KEY?.trim();
  if (!raw) return null;
  return raw.replace(/\\n/g, '\n');
}

export function googleAnalyticsDataApiConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_ANALYTICS_PROPERTY_ID?.trim() &&
      process.env.GOOGLE_ANALYTICS_CLIENT_EMAIL?.trim() &&
      envPrivateKey(),
  );
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64url');
}

async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }),
  );
  const signInput = `${header}.${claim}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signInput);
  const signature = sign.sign(privateKey, 'base64url');
  const jwt = `${signInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GA token exchange failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('GA token exchange returned no access_token.');
  return json.access_token;
}

type ReportRow = { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] };

async function runReport(
  accessToken: string,
  propertyId: string,
  body: Record<string, unknown>,
): Promise<ReportRow[]> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GA Data API error (${res.status}): ${text.slice(0, 240)}`);
  }

  const json = (await res.json()) as { rows?: ReportRow[] };
  return json.rows ?? [];
}

async function fetchPeriodMetrics(
  accessToken: string,
  propertyId: string,
  periodDays: 7 | 28,
): Promise<GaTrafficMetrics> {
  const startDate = `${periodDays}daysAgo`;

  const [summaryRows, pageRows, sourceRows, conversionRows] = await Promise.all([
    runReport(accessToken, propertyId, {
      dateRanges: [{ startDate, endDate: 'today' }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
      ],
    }),
    runReport(accessToken, propertyId, {
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 8,
    }),
    runReport(accessToken, propertyId, {
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: [{ name: 'sessionSource' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 6,
    }),
    runReport(accessToken, propertyId, {
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: {
            values: ['purchase', 'generate_lead', 'booking_complete', 'begin_checkout'],
          },
        },
      },
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 5,
    }).catch(() => [] as ReportRow[]),
  ]);

  const summary = summaryRows[0]?.metricValues ?? [];
  const users = Number(summary[0]?.value ?? 0);
  const sessions = Number(summary[1]?.value ?? 0);
  const views = Number(summary[2]?.value ?? 0);

  const topPages = pageRows
    .map((row) => ({
      path: row.dimensionValues?.[0]?.value ?? '/',
      views: Number(row.metricValues?.[0]?.value ?? 0),
    }))
    .filter((p) => p.views > 0);

  const trafficSources = sourceRows
    .map((row) => ({
      source: row.dimensionValues?.[0]?.value ?? '(direct)',
      sessions: Number(row.metricValues?.[0]?.value ?? 0),
    }))
    .filter((s) => s.sessions > 0);

  const conversions = conversionRows
    .map((row) => ({
      event: row.dimensionValues?.[0]?.value ?? 'event',
      count: Number(row.metricValues?.[0]?.value ?? 0),
    }))
    .filter((c) => c.count > 0);

  return {
    periodDays,
    users,
    sessions,
    views,
    topPages,
    trafficSources,
    conversions: conversions.length > 0 ? conversions : undefined,
  };
}

export async function fetchGoogleAnalyticsTraffic(): Promise<GaDataApiResult> {
  if (!googleAnalyticsDataApiConfigured()) {
    return { ok: false, error: 'GA Data API credentials not configured.' };
  }

  const propertyId = process.env.GOOGLE_ANALYTICS_PROPERTY_ID!.trim();
  const clientEmail = process.env.GOOGLE_ANALYTICS_CLIENT_EMAIL!.trim();
  const privateKey = envPrivateKey()!;

  try {
    const accessToken = await getAccessToken(clientEmail, privateKey);
    const [metrics7, metrics28] = await Promise.all([
      fetchPeriodMetrics(accessToken, propertyId, 7),
      fetchPeriodMetrics(accessToken, propertyId, 28),
    ]);
    return { ok: true, metrics7, metrics28 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
