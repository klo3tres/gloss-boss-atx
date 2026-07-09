import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type BusinessApiKey = {
  id: string;
  businessId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function hashKey(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateApiKeyRaw(): string {
  return `titan_${randomBytes(24).toString('base64url')}`;
}

export async function createBusinessApiKey(
  admin: SupabaseClient,
  input: {
    businessId: string;
    name?: string;
    scopes?: string[];
    createdBy?: string | null;
  },
): Promise<{ ok: boolean; rawKey?: string; key?: BusinessApiKey; error?: string }> {
  const rawKey = generateApiKeyRaw();
  const keyPrefix = rawKey.slice(0, 12);
  const keyHash = hashKey(rawKey);

  const { data, error } = await admin
    .from('business_api_keys')
    .insert({
      business_id: input.businessId,
      name: input.name ?? 'Website forms',
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes: input.scopes ?? ['leads:write'],
      created_by: input.createdBy ?? null,
    })
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };

  const row = data as Record<string, unknown>;
  return {
    ok: true,
    rawKey,
    key: {
      id: str(row.id),
      businessId: str(row.business_id),
      name: str(row.name),
      keyPrefix: str(row.key_prefix),
      scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
      lastUsedAt: null,
      revokedAt: null,
      createdAt: str(row.created_at),
    },
  };
}

export async function listBusinessApiKeys(
  admin: SupabaseClient,
  businessId: string,
): Promise<BusinessApiKey[]> {
  const { data } = await admin
    .from('business_api_keys')
    .select('*')
    .eq('business_id', businessId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: str(r.id),
      businessId: str(r.business_id),
      name: str(r.name),
      keyPrefix: str(r.key_prefix),
      scopes: Array.isArray(r.scopes) ? (r.scopes as string[]) : [],
      lastUsedAt: str(r.last_used_at) || null,
      revokedAt: str(r.revoked_at) || null,
      createdAt: str(r.created_at),
    };
  });
}

export async function revokeBusinessApiKey(
  admin: SupabaseClient,
  businessId: string,
  keyId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await admin
    .from('business_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('business_id', businessId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export type ApiKeyValidation = {
  ok: boolean;
  businessId?: string;
  keyId?: string;
  scopes?: string[];
  error?: string;
};

export async function validateApiKey(
  admin: SupabaseClient,
  rawKey: string,
): Promise<ApiKeyValidation> {
  const key = str(rawKey);
  if (!key.startsWith('titan_')) return { ok: false, error: 'Invalid API key format' };

  const keyHash = hashKey(key);
  const { data } = await admin
    .from('business_api_keys')
    .select('id, business_id, scopes, revoked_at')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (!data) return { ok: false, error: 'API key not found' };
  const row = data as Record<string, unknown>;
  if (row.revoked_at) return { ok: false, error: 'API key revoked' };

  await admin
    .from('business_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id);

  return {
    ok: true,
    businessId: str(row.business_id),
    keyId: str(row.id),
    scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
  };
}

export async function resolveBusinessFromLeadAuth(
  admin: SupabaseClient,
  input: { apiKey?: string; businessId?: string },
): Promise<ApiKeyValidation & { keyId?: string }> {
  if (input.apiKey) {
    const v = await validateApiKey(admin, input.apiKey);
    if (!v.ok) return v;
    if (!v.scopes?.includes('leads:write')) return { ok: false, error: 'API key missing leads:write scope' };
    return v;
  }

  const businessId = str(input.businessId);
  if (!businessId) return { ok: false, error: 'business_id or API key required' };

  const { data } = await admin.from('businesses').select('id').eq('id', businessId).maybeSingle();
  if (!data) return { ok: false, error: 'Business not found' };
  return { ok: true, businessId };
}
