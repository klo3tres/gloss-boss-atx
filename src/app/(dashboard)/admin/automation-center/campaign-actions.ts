'use server';

import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { loadCampaignAudience } from '@/lib/campaigns/audience';
import { generateCampaignIdeas } from '@/lib/campaigns/ideas';
import { renderCampaignTemplate, templateForTone } from '@/lib/campaigns/personalization';
import type { CampaignAudienceFilters, CampaignChannel, CampaignIdea, CampaignQueueSummary, CampaignTone } from '@/lib/campaigns/types';

type Row = Record<string, unknown>;
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '');

function str(value: unknown) { return value == null ? '' : String(value).trim(); }

async function requireOwner() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return null;
  return { admin, userId: session.user.id };
}

export async function searchCampaignAudienceAction(input: { filters?: CampaignAudienceFilters; page?: number; pageSize?: number }) {
  const gate = await requireOwner();
  if (!gate) return { recipients: [], total: 0, eligibleSms: 0, eligibleEmail: 0, page: 1, pageSize: 50, pages: 1, error: 'Unauthorized' };
  try {
    return await loadCampaignAudience(gate.admin, input);
  } catch (error) {
    return { recipients: [], total: 0, eligibleSms: 0, eligibleEmail: 0, page: 1, pageSize: 50, pages: 1, error: error instanceof Error ? error.message : 'Audience search failed' };
  }
}

export async function generateCampaignIdeasAction() {
  const gate = await requireOwner();
  if (!gate) return { ideas: [] as CampaignIdea[], error: 'Unauthorized' };
  try {
    return { ideas: await generateCampaignIdeas(gate.admin) };
  } catch (error) {
    return { ideas: [] as CampaignIdea[], error: error instanceof Error ? error.message : 'Campaign idea generation failed' };
  }
}

async function refreshCampaignCounts(admin: SupabaseClient, campaignId: string): Promise<CampaignQueueSummary> {
  const [{ data: campaign }, { data: recipients }] = await Promise.all([
    admin.from('customer_campaigns').select('*').eq('id', campaignId).single(),
    admin.from('customer_campaign_recipients').select('status, revenue_cents, clicked_at, booking_started_at, booked_at, completed_at, promotion_code').eq('campaign_id', campaignId),
  ]);
  const rows = (recipients ?? []) as Row[];
  const count = (...statuses: string[]) => rows.filter((row) => statuses.includes(str(row.status))).length;
  const summary: CampaignQueueSummary = {
    campaignId, status: str((campaign as Row | null)?.status) || 'draft', total: rows.length,
    eligible: rows.filter((row) => str(row.status) !== 'excluded').length, blocked: count('excluded','skipped'),
    queued: count('queued','scheduled','processing','paused'), sent: count('sent','delivered','booked','completed'),
    delivered: count('delivered','booked','completed'), failed: count('failed','permanent_failure'),
    clicks: rows.filter((row) => row.clicked_at).length, bookingStarts: rows.filter((row) => row.booking_started_at).length,
    bookings: rows.filter((row) => row.booked_at).length, completedJobs: rows.filter((row) => row.completed_at).length,
    collectedRevenueCents: rows.reduce((sum, row) => sum + Number(row.revenue_cents ?? 0), 0),
    unsubscribeCount: count('opted_out'),
    promoUsageCount: rows.filter((row) => row.booked_at && str(row.promotion_code)).length,
  };
  await admin.from('customer_campaigns').update({
    recipients_selected: summary.total, recipients_eligible: summary.eligible, recipients_excluded: summary.blocked,
    queued_count: summary.queued, sent_count: summary.sent, delivered_count: summary.delivered, failed_count: summary.failed,
    click_count: summary.clicks, booking_start_count: summary.bookingStarts, booking_count: summary.bookings,
    completed_job_count: summary.completedJobs, revenue_cents: summary.collectedRevenueCents, opt_out_count: summary.unsubscribeCount,
    updated_at: new Date().toISOString(),
  }).eq('id', campaignId);
  return summary;
}

function trackingLink(token: string) { return `${APP_URL}/c/${token}`; }

export async function createCampaignDraftAction(input: {
  idea: CampaignIdea;
  channels: CampaignChannel[];
  tone: CampaignTone;
  selectedCustomerIds?: string[];
  selectAllFiltered?: boolean;
  filters?: CampaignAudienceFilters;
  availableAppointmentWindow?: string;
}) {
  const gate = await requireOwner();
  if (!gate) return { error: 'Unauthorized' };
  const channels = [...new Set(input.channels)].filter((value): value is CampaignChannel => value === 'sms' || value === 'email');
  if (!channels.length) return { error: 'Choose SMS, email, or both.' };
  const audience = await loadCampaignAudience(gate.admin, { page: 1, pageSize: 2500, filters: input.filters ?? input.idea.audienceFilters });
  const selectedIds = new Set(input.selectedCustomerIds ?? []);
  const selected = input.selectAllFiltered ? audience.recipients : audience.recipients.filter((row) => selectedIds.has(row.customerId));
  if (!selected.length) return { error: 'Select at least one customer.' };
  const campaignId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { error: campaignError } = await gate.admin.from('customer_campaigns').insert({
    id: campaignId, name: input.idea.name, channel: channels.length === 2 ? 'both' : channels[0], status: 'draft',
    audience_key: input.idea.id, audience_label: input.idea.targetAudience, message_quick: input.idea.quick,
    message_professional: input.idea.professional, message_warm: input.idea.warm,
    message_selected: templateForTone(input.idea, input.tone), subject: input.idea.emailSubject, email_body: input.idea.emailBody,
    social_caption: input.idea.socialCaption, selected_tone: input.tone, offer_code: input.idea.promoCode,
    offer_id: input.idea.promotionId, recommended_service_slug: input.idea.recommendedServiceSlug,
    destination_path: input.idea.destinationPath, expires_at: input.idea.expiresAt, created_by: gate.userId,
    recipients_selected: selected.length * channels.length,
    meta: { idea: input.idea, filters: input.filters ?? input.idea.audienceFilters, projected_bookings: input.idea.projectedBookings, projected_revenue_cents: input.idea.projectedRevenueCents, owner_approval_required: true },
  });
  if (campaignError) return { error: campaignError.message };

  const cooldownStart = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: recentRows } = await gate.admin.from('customer_campaign_recipients').select('customer_id, channel').gte('sent_at', cooldownStart).in('customer_id', selected.map((row) => row.customerId));
  const cooled = new Set(((recentRows ?? []) as Row[]).map((row) => `${str(row.customer_id)}:${str(row.channel)}`));
  const recipientRows: Row[] = [];
  for (const recipient of selected) {
    for (const channel of channels) {
      const token = crypto.randomBytes(18).toString('hex');
      const channelEligible = channel === 'sms' ? recipient.canSms : recipient.canEmail;
      const cooldownBlocked = cooled.has(`${recipient.customerId}:${channel}`);
      const excludeReason = !channelEligible ? (channel === 'sms' ? recipient.blockerReasons.find((value) => value.startsWith('SMS')) : recipient.blockerReasons.find((value) => value.startsWith('Email'))) : cooldownBlocked ? 'Customer received this channel within the 7-day campaign cooldown.' : null;
      const context = {
        ...recipient, promotion: input.idea.recommendedOffer, recommendedService: input.idea.recommendedService,
        availableAppointmentWindow: input.availableAppointmentWindow ?? 'openings available this week', trackedCampaignLink: trackingLink(token),
      };
      const sourceTemplate = channel === 'email' ? input.idea.emailBody : templateForTone(input.idea, input.tone);
      recipientRows.push({
        campaign_id: campaignId, customer_id: recipient.customerId, email: recipient.email, phone: recipient.phone, channel,
        selected: true, tracking_token: token, idempotency_key: `${campaignId}:${recipient.customerId}:${channel}`,
        rendered_subject: channel === 'email' ? renderCampaignTemplate(input.idea.emailSubject, context) : null,
        rendered_body: renderCampaignTemplate(sourceTemplate, context), status: excludeReason ? 'excluded' : 'draft',
        exclude_reason: excludeReason, promotion_id: input.idea.promotionId, promotion_code: input.idea.promoCode,
        personalization: context, eligibility: { channelEligible, cooldownBlocked, blockerReasons: recipient.blockerReasons },
      });
    }
  }
  const { error: recipientError } = await gate.admin.from('customer_campaign_recipients').insert(recipientRows);
  if (recipientError) {
    await gate.admin.from('customer_campaigns').delete().eq('id', campaignId);
    return { error: recipientError.message };
  }
  const summary = await refreshCampaignCounts(gate.admin, campaignId);
  revalidatePath('/admin/automation-center');
  return { ok: true, campaignId, summary };
}

export async function loadCampaignDetailAction(campaignId: string, page = 1, pageSize = 25, search = '') {
  const gate = await requireOwner();
  if (!gate) return { error: 'Unauthorized', campaign: null, recipients: [], summary: null };
  const from = Math.max(0, (page - 1) * pageSize);
  let query = gate.admin.from('customer_campaign_recipients').select('*', { count: 'exact' }).eq('campaign_id', campaignId).order('created_at').range(from, from + pageSize - 1);
  if (search.trim()) query = query.or(`email.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`);
  const [{ data: campaign }, recipientResult, summary] = await Promise.all([
    gate.admin.from('customer_campaigns').select('*').eq('id', campaignId).single(), query, refreshCampaignCounts(gate.admin, campaignId),
  ]);
  return { campaign, recipients: recipientResult.data ?? [], total: recipientResult.count ?? 0, summary, page, pages: Math.max(1, Math.ceil((recipientResult.count ?? 0) / pageSize)) };
}

export async function loadCampaignsAction(limit = 20) {
  const gate = await requireOwner();
  if (!gate) return { campaigns: [], error: 'Unauthorized' };
  const { data, error } = await gate.admin.from('customer_campaigns').select('id,name,status,channel,audience_label,recipients_selected,recipients_eligible,recipients_excluded,queued_count,sent_count,delivered_count,failed_count,click_count,booking_start_count,booking_count,completed_job_count,revenue_cents,opt_out_count,created_at,updated_at,expires_at,meta').order('created_at',{ascending:false}).limit(Math.max(1,Math.min(100,limit)));
  return { campaigns: data ?? [], error: error?.message };
}

export async function duplicateCampaignAction(campaignId: string) {
  const gate = await requireOwner(); if (!gate) return { error:'Unauthorized' };
  const [{data:campaign,error},{data:recipients}] = await Promise.all([
    gate.admin.from('customer_campaigns').select('*').eq('id',campaignId).single(),
    gate.admin.from('customer_campaign_recipients').select('*').eq('campaign_id',campaignId).limit(2500),
  ]);
  if(error||!campaign)return{error:error?.message??'Campaign not found'};
  const nextId=crypto.randomUUID(); const now=new Date().toISOString(); const copy={...(campaign as Row)};
  for(const key of ['id','sent_at','started_at','paused_at','canceled_at','completed_at','created_at','updated_at'])delete copy[key];
  Object.assign(copy,{id:nextId,name:`${str(campaign.name)} (copy)`,status:'draft',scheduled_at:null,recipients_selected:0,recipients_eligible:0,recipients_excluded:0,queued_count:0,sent_count:0,delivered_count:0,failed_count:0,click_count:0,booking_start_count:0,booking_count:0,completed_job_count:0,revenue_cents:0,opt_out_count:0,created_by:gate.userId,created_at:now,updated_at:now});
  const inserted=await gate.admin.from('customer_campaigns').insert(copy); if(inserted.error)return{error:inserted.error.message};
  const rows=((recipients??[])as Row[]).map((source)=>{const row={...source}; const oldToken=str(row.tracking_token); const token=crypto.randomBytes(18).toString('hex'); for(const key of ['id','provider_id','error_message','queued_at','processing_started_at','sent_at','delivered_at','failed_at','next_attempt_at','clicked_at','booking_started_at','booked_at','completed_at','booked_appointment_id','created_at','updated_at'])delete row[key]; Object.assign(row,{campaign_id:nextId,tracking_token:token,idempotency_key:`${nextId}:${str(row.customer_id)||crypto.randomUUID()}:${str(row.channel)}`,status:str(row.status)==='excluded'?'excluded':'draft',attempt_count:0,revenue_cents:0,rendered_body:str(row.rendered_body).replace(oldToken,token),created_at:now,updated_at:now}); return row;});
  if(rows.length){const saved=await gate.admin.from('customer_campaign_recipients').insert(rows);if(saved.error){await gate.admin.from('customer_campaigns').delete().eq('id',nextId);return{error:saved.error.message};}}
  const summary=await refreshCampaignCounts(gate.admin,nextId); revalidatePath('/admin/automation-center'); return{ok:true,campaignId:nextId,summary};
}

export async function queueCampaignAction(input: { campaignId: string; scheduledFor?: string | null }) {
  const gate = await requireOwner();
  if (!gate) return { error: 'Unauthorized' };
  const scheduled = input.scheduledFor ? new Date(input.scheduledFor) : null;
  if (scheduled && Number.isNaN(scheduled.getTime())) return { error: 'Invalid schedule time.' };
  const now = new Date();
  const isFuture = scheduled && scheduled.getTime() > now.getTime();
  await gate.admin.from('customer_campaign_recipients').update({ status: isFuture ? 'scheduled' : 'queued', queued_at: now.toISOString(), scheduled_for: scheduled?.toISOString() ?? null, updated_at: now.toISOString() }).eq('campaign_id', input.campaignId).eq('status', 'draft');
  await gate.admin.from('customer_campaigns').update({ status: isFuture ? 'scheduled' : 'approved', scheduled_at: scheduled?.toISOString() ?? null, updated_at: now.toISOString() }).eq('id', input.campaignId).eq('status', 'draft');
  const summary = await refreshCampaignCounts(gate.admin, input.campaignId);
  revalidatePath('/admin/automation-center');
  return { ok: true, summary };
}

function chicagoHour() {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', hour12: false }).format(new Date()));
}

export async function processCampaignBatchAction(campaignId: string, batchSize = 10) {
  const gate = await requireOwner();
  if (!gate) return { error: 'Unauthorized' };
  const hour = chicagoHour();
  if (hour < 8 || hour >= 20) return { error: 'Quiet hours are active (8 PM–8 AM Chicago time). The queue remains safe to resume.' };
  await gate.admin.from('customer_campaigns').update({ status: 'sending', started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', campaignId).in('status', ['approved','scheduled','sending']);
  const { data, error } = await gate.admin.rpc('claim_customer_campaign_batch', { p_campaign_id: campaignId, p_limit: Math.max(1, Math.min(25, batchSize)) });
  if (error) return { error: error.message };
  const rows = (data ?? []) as Row[];
  let processed = 0;
  for (const row of rows) {
    const channel = str(row.channel) as CampaignChannel;
    const to = channel === 'sms' ? str(row.phone) : str(row.email);
    let ok = false;
    let providerId: string | null = null;
    let failure: string | null = null;
    if (!to) failure = `No ${channel} destination`;
    else if (channel === 'sms') {
      const { sendCustomerSms } = await import('@/lib/sms-send');
      const result = await sendCustomerSms({ db: gate.admin, kind: 'customer_campaign', template_key: 'customer_campaign', to, body: str(row.rendered_body), customer_id: str(row.customer_id) || null, requireConsent: true, extraPayload: { campaign_id: campaignId, campaign_recipient_id: str(row.id), tracking_token: str(row.tracking_token) } });
      ok = result.ok; providerId = result.sid ?? null; failure = result.error ?? (result.skipped ? 'SMS blocked by consent or provider policy' : null);
    } else {
      const { resendConfigured, sendResendHtml } = await import('@/lib/email-send');
      const { escapeEmailHtml, glossBossEmailLayout } = await import('@/lib/email/templates/layout');
      if (!resendConfigured()) failure = 'Resend is not configured';
      else {
        const result = await sendResendHtml({ to, subject: str(row.rendered_subject) || 'Gloss Boss ATX', html: glossBossEmailLayout({ title: str(row.rendered_subject) || 'Gloss Boss ATX', bodyHtml: `<p style="color:#18181b;font-size:15px;line-height:1.65;white-space:pre-wrap">${escapeEmailHtml(str(row.rendered_body))}</p>` }) });
        ok = result.ok; providerId = result.emailId ?? null; failure = result.error ?? null;
        await gate.admin.from('notification_outbox').insert({
          kind: 'customer_campaign', channel: 'email', provider: 'resend', status: ok ? 'sent' : 'failed',
          provider_message_id: providerId, error_message: failure, customer_id: str(row.customer_id) || null,
          subject: str(row.rendered_subject) || 'Gloss Boss ATX', sent_at: ok ? new Date().toISOString() : null,
          payload: { to, body: str(row.rendered_body), campaign_id: campaignId, campaign_recipient_id: str(row.id), tracking_token: str(row.tracking_token), resend_email_id: providerId },
          created_at: new Date().toISOString(),
        });
      }
    }
    const attempt = Number(row.attempt_count ?? 1);
    const permanent = !ok && (attempt >= Number(row.max_attempts ?? 3) || /invalid|opt.?out|consent|unsubscrib|no .* destination|not configured/i.test(failure ?? ''));
    const nextAttempt = !ok && !permanent ? new Date(Date.now() + Math.min(60, 5 * 2 ** Math.max(0, attempt - 1)) * 60000).toISOString() : null;
    await gate.admin.from('customer_campaign_recipients').update(ok ? { status: 'sent', provider_id: providerId, error_message: null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() } : { status: permanent ? 'permanent_failure' : 'failed', error_message: failure ?? 'Provider failure', failed_at: new Date().toISOString(), next_attempt_at: nextAttempt, updated_at: new Date().toISOString() }).eq('id', str(row.id)).eq('status', 'processing');
    await gate.admin.from('customer_campaign_events').insert({ campaign_id: campaignId, recipient_id: str(row.id), customer_id: str(row.customer_id) || null, event_type: ok ? 'sent' : permanent ? 'permanent_failure' : 'failed', channel, meta: { provider_id: providerId, error: failure, attempt } });
    processed++;
  }
  const summary = await refreshCampaignCounts(gate.admin, campaignId);
  if (summary.queued === 0) await gate.admin.from('customer_campaigns').update({ status: summary.failed > 0 && summary.sent === 0 ? 'failed' : 'sent', completed_at: new Date().toISOString(), sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', campaignId).eq('status', 'sending');
  revalidatePath('/admin/automation-center');
  return { ok: true, processed, summary: await refreshCampaignCounts(gate.admin, campaignId) };
}

export async function pauseCampaignAction(campaignId: string) {
  const gate = await requireOwner(); if (!gate) return { error: 'Unauthorized' };
  await Promise.all([gate.admin.from('customer_campaigns').update({ status:'paused',paused_at:new Date().toISOString(),updated_at:new Date().toISOString() }).eq('id',campaignId).in('status',['approved','scheduled','sending']), gate.admin.from('customer_campaign_recipients').update({status:'paused',updated_at:new Date().toISOString()}).eq('campaign_id',campaignId).in('status',['queued','scheduled','failed'])]);
  return { ok:true, summary:await refreshCampaignCounts(gate.admin,campaignId) };
}

export async function resumeCampaignAction(campaignId: string) {
  const gate = await requireOwner(); if (!gate) return { error: 'Unauthorized' };
  await Promise.all([gate.admin.from('customer_campaigns').update({ status:'approved',paused_at:null,updated_at:new Date().toISOString() }).eq('id',campaignId).eq('status','paused'), gate.admin.from('customer_campaign_recipients').update({status:'queued',updated_at:new Date().toISOString()}).eq('campaign_id',campaignId).eq('status','paused')]);
  return { ok:true, summary:await refreshCampaignCounts(gate.admin,campaignId) };
}

export async function cancelCampaignAction(campaignId: string) {
  const gate = await requireOwner(); if (!gate) return { error: 'Unauthorized' };
  await Promise.all([gate.admin.from('customer_campaigns').update({ status:'canceled',canceled_at:new Date().toISOString(),updated_at:new Date().toISOString() }).eq('id',campaignId).not('status','in','("sent","delivered","canceled")'), gate.admin.from('customer_campaign_recipients').update({status:'canceled',updated_at:new Date().toISOString()}).eq('campaign_id',campaignId).in('status',['draft','queued','scheduled','failed','paused'])]);
  return { ok:true, summary:await refreshCampaignCounts(gate.admin,campaignId) };
}

export async function retryFailedCampaignRecipientsAction(campaignId: string) {
  const gate = await requireOwner(); if (!gate) return { error: 'Unauthorized' };
  await gate.admin.from('customer_campaign_recipients').update({status:'queued',next_attempt_at:null,error_message:null,updated_at:new Date().toISOString()}).eq('campaign_id',campaignId).eq('status','failed');
  await gate.admin.from('customer_campaigns').update({status:'approved',updated_at:new Date().toISOString()}).eq('id',campaignId).in('status',['failed','sent']);
  return { ok:true, summary:await refreshCampaignCounts(gate.admin,campaignId) };
}

export async function sendCampaignTestToOwnerAction(input: { campaignId: string; recipientId: string }) {
  const gate = await requireOwner(); if (!gate) return { error: 'Unauthorized' };
  const { data: row } = await gate.admin.from('customer_campaign_recipients').select('channel,rendered_subject,rendered_body').eq('id',input.recipientId).eq('campaign_id',input.campaignId).single();
  if (!row) return { error:'Recipient preview not found.' };
  if (row.channel === 'sms') {
    const { businessNotifyPhone } = await import('@/lib/business-booking-notify'); const { sendCustomerSms } = await import('@/lib/sms-send'); const to=businessNotifyPhone(); if(!to)return{error:'Owner phone is not configured.'}; const result=await sendCustomerSms({db:gate.admin,kind:'campaign_owner_test',template_key:'campaign_owner_test',to,body:`[TEST — NO CUSTOMER RECEIVED THIS]\n${row.rendered_body}`,requireConsent:false,extraPayload:{campaign_id:input.campaignId,test:true}}); return result.ok?{ok:true,destination:`phone ending ${to.replace(/\D/g,'').slice(-4)}`}:{error:result.error??'Test failed'};
  }
  const { businessNotifyDestination, sendResendHtml }=await import('@/lib/email-send'); const to=businessNotifyDestination(); if(!to)return{error:'Owner email is not configured.'}; const result=await sendResendHtml({to,subject:`[TEST] ${row.rendered_subject??'Gloss Boss ATX campaign'}`,html:`<p><strong>TEST — no customer received this.</strong></p><p>${str(row.rendered_body).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br/>')}</p>`}); return result.ok?{ok:true,destination:to.replace(/(^.).*(@.*$)/,'$1***$2')}:{error:result.error??'Test failed'};
}
