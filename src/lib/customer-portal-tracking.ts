import { createHash, createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isStaffRole, type AppRole } from '@/lib/auth/roles';

export type PortalEventType =
  | 'admin_preview_opened'
  | 'portal_opened'
  | 'acknowledgement_started'
  | 'payment_page_opened'
  | 'account_claim_started'
  | 'account_created';

type RequestClassification = {
  adminPreview: boolean;
  botSuspected: boolean;
  counted: boolean;
  deviceType: string;
  browserFamily: string;
  userAgentClassification: string;
  ipHash: string | null;
  exclusionReason: string | null;
};

function str(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function shortHash(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 20);
}

function privacyHash(value: string) {
  const secret =
    process.env.PORTAL_TRACKING_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'gloss-boss-portal-tracking';
  return createHmac('sha256', secret).update(value).digest('hex').slice(0, 24);
}

export function portalTokenFingerprint(token: string) {
  return token ? shortHash(token) : null;
}

export function classifyPortalRequest(input: {
  headers: Headers;
  role?: AppRole | null;
  adminPreview?: boolean;
  method?: string;
}): RequestClassification {
  const h = input.headers;
  const ua = str(h.get('user-agent')).toLowerCase();
  const purpose = [
    h.get('purpose'),
    h.get('sec-purpose'),
    h.get('x-purpose'),
    h.get('x-moz'),
  ]
    .map(str)
    .join(' ')
    .toLowerCase();
  const prefetch =
    purpose.includes('prefetch') ||
    h.get('next-router-prefetch') === '1' ||
    h.get('x-middleware-prefetch') === '1';
  const botPattern =
    /bot|crawler|spider|preview|unfurl|scanner|safelinks|proofpoint|barracuda|urlscan|uptime|monitor|headless|playwright|puppeteer|curl|wget|facebookexternalhit|slackbot|discordbot|twitterbot|googleimageproxy|microsoft office|outlook/i;
  const botSuspected = prefetch || !ua || botPattern.test(ua);
  const adminPreview = Boolean(input.adminPreview || isStaffRole(input.role));
  const method = str(input.method || 'GET').toUpperCase();
  const methodExcluded = method === 'HEAD' || !['GET', 'POST'].includes(method);
  const exclusionReason = adminPreview
    ? 'owner_or_staff_session'
    : methodExcluded
      ? 'non_get_request'
      : prefetch
        ? 'prefetch'
        : botSuspected
          ? 'automated_or_link_scanner'
          : null;

  const deviceType = /ipad|tablet/.test(ua)
    ? 'tablet'
    : /mobile|iphone|android/.test(ua)
      ? 'mobile'
      : 'desktop';
  const browserFamily = /edg\//.test(ua)
    ? 'Edge'
    : /chrome|crios/.test(ua)
      ? 'Chrome'
      : /safari/.test(ua)
        ? 'Safari'
        : /firefox|fxios/.test(ua)
          ? 'Firefox'
          : botSuspected
            ? 'Automated'
            : 'Other';
  const forwarded = str(h.get('x-forwarded-for')).split(',')[0]?.trim();
  const ip = forwarded || str(h.get('x-real-ip'));

  return {
    adminPreview,
    botSuspected,
    counted: !exclusionReason,
    deviceType,
    browserFamily,
    userAgentClassification: adminPreview ? 'staff' : botSuspected ? 'automated' : 'customer_browser',
    ipHash: ip ? privacyHash(ip) : null,
    exclusionReason,
  };
}

export async function recordCustomerPortalEvent(
  admin: SupabaseClient,
  input: {
    appointmentId: string;
    customerId?: string | null;
    token?: string | null;
    eventType: PortalEventType;
    headers: Headers;
    role?: AppRole | null;
    adminPreview?: boolean;
    method?: string;
    channelSource?: string | null;
    campaignMessageId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<{ counted: boolean; exclusionReason: string | null }> {
  const classification = classifyPortalRequest({
    headers: input.headers,
    role: input.role,
    adminPreview: input.adminPreview,
    method: input.method,
  });
  let counted = classification.counted;

  // A browser retry or redirect loop is one customer action, not dozens of clicks.
  if (counted) {
    const since = new Date(Date.now() - 30_000).toISOString();
    const { count, error } = await admin
      .from('customer_portal_events')
      .select('id', { count: 'exact', head: true })
      .eq('appointment_id', input.appointmentId)
      .eq('event_type', input.eventType)
      .eq('token_fingerprint', portalTokenFingerprint(str(input.token)))
      .eq('counted', true)
      .gte('occurred_at', since);
    if (!error && (count ?? 0) > 0) counted = false;
  }

  const metadata = {
    ...(input.metadata ?? {}),
    ...(classification.exclusionReason ? { exclusion_reason: classification.exclusionReason } : {}),
    ...(!classification.exclusionReason && !counted ? { exclusion_reason: 'duplicate_navigation' } : {}),
  };
  const args = {
    p_appointment_id: input.appointmentId,
    p_customer_id: input.customerId || null,
    p_token_fingerprint: portalTokenFingerprint(str(input.token)),
    p_event_type: input.eventType,
    p_channel_source: input.channelSource || null,
    p_campaign_message_id: input.campaignMessageId || null,
    p_device_type: classification.deviceType,
    p_browser_family: classification.browserFamily,
    p_ip_hash: classification.ipHash,
    p_user_agent_classification: classification.userAgentClassification,
    p_admin_preview: classification.adminPreview,
    p_bot_suspected: classification.botSuspected,
    p_counted: counted,
    p_metadata: metadata,
  };

  try {
    const result = await admin.rpc('record_customer_portal_event', args);
    if (result.error) console.warn('[portal_tracking]', input.eventType, result.error.message);
  } catch (error) {
    console.warn('[portal_tracking] unavailable', error);
  }
  return {
    counted,
    exclusionReason:
      classification.exclusionReason || (!counted ? 'duplicate_navigation' : null),
  };
}
