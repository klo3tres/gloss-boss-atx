import type { SupabaseClient } from '@supabase/supabase-js';
import type { TitanIntegrationType } from '@/lib/titan/industry-profiles';
import { twilioConfigured } from '@/lib/email-send';
import { resendConfigured } from '@/lib/email-send';
import { googleCalendarOAuthConfigured } from '@/lib/google/google-calendar-config';

export type BusinessIntegration = {
  id: string;
  businessId: string;
  integrationType: TitanIntegrationType;
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  connectedAccount: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  permissions: string[];
  syncEnabled: boolean;
  metadata: Record<string, unknown>;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function mapRow(row: Record<string, unknown>): BusinessIntegration {
  return {
    id: str(row.id),
    businessId: str(row.business_id),
    integrationType: str(row.integration_type) as TitanIntegrationType,
    status: (str(row.status) || 'disconnected') as BusinessIntegration['status'],
    connectedAccount: str(row.connected_account) || null,
    lastSyncAt: str(row.last_sync_at) || null,
    lastError: str(row.last_error) || null,
    permissions: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
    syncEnabled: row.sync_enabled !== false,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

export async function loadBusinessIntegrations(
  admin: SupabaseClient,
  businessId: string,
): Promise<{ integrations: BusinessIntegration[]; tablesReady: boolean }> {
  const probe = await admin.from('business_integrations').select('id').limit(1);
  if (probe.error && /does not exist|schema cache/i.test(probe.error.message)) {
    return { integrations: [], tablesReady: false };
  }

  const { data } = await admin
    .from('business_integrations')
    .select('*')
    .eq('business_id', businessId)
    .order('integration_type', { ascending: true });

  const fromDb = (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
  const merged = mergePlatformIntegrationStatus(businessId, fromDb);
  return { integrations: merged, tablesReady: true };
}

function mergePlatformIntegrationStatus(
  businessId: string,
  rows: BusinessIntegration[],
): BusinessIntegration[] {
  const byType = new Map(rows.map((r) => [r.integrationType, r]));
  const ensure = (
    type: TitanIntegrationType,
    connected: boolean,
    account: string | null,
    permissions: string[],
    lastError?: string | null,
  ) => {
    const existing = byType.get(type);
    if (existing) return;
    byType.set(type, {
      id: `platform-${type}`,
      businessId,
      integrationType: type,
      status: connected ? 'connected' : 'disconnected',
      connectedAccount: account,
      lastSyncAt: null,
      lastError: lastError ?? null,
      permissions,
      syncEnabled: true,
      metadata: { source: 'platform_env' },
    });
  };

  ensure('twilio', twilioConfigured(), twilioConfigured() ? 'Platform Twilio' : null, ['sms:send']);
  ensure('resend', resendConfigured(), resendConfigured() ? 'Platform Resend' : null, ['email:send']);
  ensure(
    'google_calendar',
    googleCalendarOAuthConfigured(),
    googleCalendarOAuthConfigured() ? 'Connect to authorize' : null,
    ['calendar.events'],
    googleCalendarOAuthConfigured() ? null : 'GOOGLE_CALENDAR_CLIENT_ID not configured',
  );

  return [...byType.values()].sort((a, b) => a.integrationType.localeCompare(b.integrationType));
}

export async function upsertBusinessIntegration(
  admin: SupabaseClient,
  input: {
    businessId: string;
    userId?: string | null;
    integrationType: TitanIntegrationType;
    status: BusinessIntegration['status'];
    connectedAccount?: string | null;
    accessToken?: string | null;
    refreshToken?: string | null;
    tokenExpiresAt?: string | null;
    scopes?: string[];
    metadata?: Record<string, unknown>;
    lastError?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { error } = await admin.from('business_integrations').upsert(
    {
      business_id: input.businessId,
      user_id: input.userId ?? null,
      integration_type: input.integrationType,
      status: input.status,
      connected_account: input.connectedAccount ?? null,
      access_token: input.accessToken ?? null,
      refresh_token: input.refreshToken ?? null,
      token_expires_at: input.tokenExpiresAt ?? null,
      scopes: input.scopes ?? [],
      metadata: input.metadata ?? {},
      last_error: input.lastError ?? null,
      updated_at: now,
    },
    { onConflict: 'business_id,integration_type,user_id' },
  );

  if (error) return { ok: false, error: error.message };

  await logConnectionEvent(admin, {
    businessId: input.businessId,
    integrationType: input.integrationType,
    eventType: input.status === 'connected' ? 'connected' : 'updated',
    message: `${input.integrationType} ${input.status}`,
  });

  return { ok: true };
}

export async function disconnectBusinessIntegration(
  admin: SupabaseClient,
  businessId: string,
  integrationType: TitanIntegrationType,
  userId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  let query = admin
    .from('business_integrations')
    .update({
      status: 'disconnected',
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('business_id', businessId)
    .eq('integration_type', integrationType);

  if (userId) query = query.eq('user_id', userId);

  const { error } = await query;
  if (error) return { ok: false, error: error.message };

  await logConnectionEvent(admin, {
    businessId,
    integrationType,
    eventType: 'disconnected',
    message: `${integrationType} disconnected`,
  });

  return { ok: true };
}

export async function logConnectionEvent(
  admin: SupabaseClient,
  input: {
    businessId: string;
    integrationType?: string;
    eventType: string;
    message?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await admin.from('titan_connection_events').insert({
      business_id: input.businessId,
      integration_type: input.integrationType ?? null,
      event_type: input.eventType,
      message: input.message ?? null,
      metadata: input.metadata ?? {},
    });
  } catch {
    /* best effort */
  }
}

export async function markIntegrationSync(
  admin: SupabaseClient,
  businessId: string,
  integrationType: TitanIntegrationType,
  opts?: { error?: string | null },
): Promise<void> {
  const now = new Date().toISOString();
  await admin
    .from('business_integrations')
    .update({
      last_sync_at: opts?.error ? undefined : now,
      last_error: opts?.error ?? null,
      status: opts?.error ? 'error' : 'connected',
      updated_at: now,
    })
    .eq('business_id', businessId)
    .eq('integration_type', integrationType);
}
