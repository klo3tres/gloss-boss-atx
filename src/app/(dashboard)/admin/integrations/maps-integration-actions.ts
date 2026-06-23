'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import {
  runIntegrationProbe,
  runResendIntegrationTest,
  runTwilioIntegrationTest,
  type IntegrationTestKind,
} from '@/lib/integrations/integration-tests';
import type { MapProviderId } from '@/lib/integrations/maps-discovery-status';
import { resolveMapProvider } from '@/lib/integrations/maps-discovery-status';

async function gate() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return null;
  return { admin, userId: session.user.id, email: session.user.email ?? null };
}

export async function runIntegrationProbeAction(kind: IntegrationTestKind) {
  const g = await gate();
  if (!g) return { ok: false, status: 'missing' as const, detail: 'Not authorized.' };

  const result = await runIntegrationProbe(kind);

  await g.admin.from('integration_test_events').insert({
    kind: `${kind}_probe`,
    status: result.ok ? 'sent' : 'failed',
    destination: kind,
    error_message: result.detail,
    actor_id: g.userId,
    created_at: new Date().toISOString(),
  });

  revalidatePath('/admin/integrations');
  revalidatePath('/admin/launch-readiness');
  return result;
}

export async function saveMapProviderAction(provider: MapProviderId) {
  const g = await gate();
  if (!g) return { ok: false, error: 'Not authorized.' };

  const effective = resolveMapProvider(provider);
  const { error } = await g.admin
    .from('titan_workspace_settings')
    .upsert(
      {
        workspace_key: 'default',
        map_provider: effective,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_key' },
    );

  if (error) {
    if (/map_provider|schema cache/i.test(error.message)) {
      return { ok: false, error: 'Apply migration 000098 for map_provider column.' };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/super');
  revalidatePath('/admin/integrations');
  return { ok: true, provider: effective };
}

export async function saveSocialOutreachTargetAction(formData: FormData) {
  const g = await gate();
  if (!g) return { ok: false, error: 'Not authorized.' };

  const platform = String(formData.get('platform') ?? 'facebook_group');
  const label = String(formData.get('label') ?? '').trim();
  const url = String(formData.get('url') ?? '').trim();
  const keywords = String(formData.get('keywords') ?? '').trim();

  if (!label) return { ok: false, error: 'Label required.' };

  const { error } = await g.admin.from('titan_social_outreach').insert({
    platform,
    label,
    url: url || null,
    keywords: keywords || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    if (/titan_social/i.test(error.message)) {
      return { ok: false, error: 'Apply migration 000098 for social outreach tables.' };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/super');
  return { ok: true };
}

export async function saveSocialPostAction(formData: FormData) {
  const g = await gate();
  if (!g) return { ok: false, error: 'Not authorized.' };

  const postText = String(formData.get('post_text') ?? '').trim();
  const platform = String(formData.get('platform') ?? 'facebook_group');
  const authorName = String(formData.get('author_name') ?? '').trim();
  const outreachId = String(formData.get('outreach_id') ?? '').trim();

  if (!postText) return { ok: false, error: 'Paste the post or comment text.' };

  const { data, error } = await g.admin
    .from('titan_social_posts')
    .insert({
      platform,
      post_text: postText,
      author_name: authorName || null,
      outreach_id: outreachId || null,
      status: 'new',
      created_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/super');
  return { ok: true, id: data?.id };
}

export async function generateSocialReplyAction(postId: string) {
  const g = await gate();
  if (!g) return { ok: false, error: 'Not authorized.' };

  const { data: post } = await g.admin.from('titan_social_posts').select('*').eq('id', postId).maybeSingle();
  if (!post) return { ok: false, error: 'Post not found.' };

  const text = String((post as Record<string, unknown>).post_text ?? '');
  const reply = `Thanks for sharing! We help local businesses keep vehicles looking sharp — happy to answer questions about fleet or recurring service. (Paste this manually — no auto-posting.)`;
  const dm = `Hi — saw your post about vehicle care. Gloss Boss ATX does mobile detailing for businesses in the area. Want a quick quote?`;

  await g.admin
    .from('titan_social_posts')
    .update({
      generated_reply: reply,
      generated_dm: dm,
      status: 'new',
    })
    .eq('id', postId);

  revalidatePath('/admin/super');
  return { ok: true, reply, dm };
}

export async function logSocialOutcomeAction(postId: string, outcome: string, notes: string) {
  const g = await gate();
  if (!g) return { ok: false, error: 'Not authorized.' };

  const status =
    outcome === 'replied' ? 'replied' : outcome === 'dm_sent' ? 'dm_sent' : outcome === 'converted' ? 'converted' : 'ignored';

  const { error } = await g.admin
    .from('titan_social_posts')
    .update({
      status,
      outcome,
      outcome_notes: notes || null,
    })
    .eq('id', postId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/super');
  return { ok: true };
}
