/**
 * Post-send message quality coach — scores outreach from content signals.
 * No LLM required; learns style preferences via titan_message_scores when available.
 */

export type SalesCoachScore = {
  styleLabel: 'Quick' | 'Professional' | 'Warm' | 'Mixed';
  responseProbability: number;
  reason: string;
  suggestedImprovement: string;
  signals: string[];
};

function hasCta(body: string): boolean {
  return /book|pay|reply|schedule|link|http|www\.|call me|let me know|openings?/i.test(body);
}

function mentionsBusiness(body: string): boolean {
  return /gloss boss|glossboss|kyle/i.test(body);
}

function mentionsService(body: string): boolean {
  return /detail|interior|exterior|ceramic|fleet|wash|polish|coating|membership/i.test(body);
}

function mentionsVehicleOrName(body: string): boolean {
  return /\b(your|the)\s+\w+\b|suv|truck|sedan|tesla|f-?150|suburban|tahoe/i.test(body);
}

function isWarm(body: string): boolean {
  return /thanks|appreciate|hope|glad|looking forward|great|love/i.test(body);
}

function isQuick(body: string): boolean {
  return body.trim().length < 160 && !body.includes('\n\n');
}

export function scoreOutboundMessage(body: string, channel: 'sms' | 'email' = 'sms'): SalesCoachScore {
  const text = body.trim();
  const signals: string[] = [];
  let score = 42;

  if (mentionsBusiness(text)) {
    score += 12;
    signals.push('Mentions business');
  }
  if (mentionsService(text)) {
    score += 12;
    signals.push('References service');
  }
  if (hasCta(text)) {
    score += 14;
    signals.push('Includes CTA');
  }
  if (mentionsVehicleOrName(text)) {
    score += 8;
    signals.push('Personalizes vehicle/context');
  }
  if (isWarm(text)) {
    score += 6;
    signals.push('Warm tone');
  }
  if (channel === 'sms' && text.length > 320) {
    score -= 10;
    signals.push('SMS may be too long');
  }
  if (channel === 'email' && text.length < 40) {
    score -= 8;
    signals.push('Email body is thin');
  }
  if (!hasCta(text)) {
    score -= 6;
  }

  const responseProbability = Math.max(18, Math.min(92, score));

  let styleLabel: SalesCoachScore['styleLabel'] = 'Mixed';
  if (isQuick(text) && !isWarm(text)) styleLabel = 'Quick';
  else if (isWarm(text) && !isQuick(text)) styleLabel = 'Warm';
  else if (mentionsBusiness(text) && mentionsService(text)) styleLabel = 'Professional';

  const reason =
    signals.length > 0
      ? signals.slice(0, 4).join(' · ')
      : 'Generic copy — add business, service, and a clear next step.';

  let suggestedImprovement = 'Mention a specific opening day or time window.';
  if (!hasCta(text)) suggestedImprovement = 'Add a clear CTA (book link, pay link, or “reply YES”).';
  else if (!mentionsService(text)) suggestedImprovement = 'Name the service so the ask feels concrete.';
  else if (!mentionsVehicleOrName(text)) suggestedImprovement = 'Reference their vehicle or last visit for higher reply rate.';
  else if (channel === 'sms' && text.length > 280) suggestedImprovement = 'Shorten to one ask — SMS converts better under ~280 characters.';
  else if (styleLabel === 'Quick') suggestedImprovement = 'Add one warm line before the CTA to lift trust.';

  return {
    styleLabel,
    responseProbability,
    reason,
    suggestedImprovement,
    signals,
  };
}

export async function persistMessageScore(
  admin: { from: (t: string) => { insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> } },
  input: {
    channel: 'sms' | 'email';
    kind: string;
    body: string;
    score: SalesCoachScore;
    entityType?: string | null;
    entityId?: string | null;
    customerId?: string | null;
  },
): Promise<void> {
  try {
    await admin.from('titan_message_scores').insert({
      channel: input.channel,
      kind: input.kind,
      body_preview: input.body.slice(0, 400),
      style_label: input.score.styleLabel,
      response_probability: input.score.responseProbability,
      reason: input.score.reason,
      suggested_improvement: input.score.suggestedImprovement,
      signals: input.score.signals,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      customer_id: input.customerId ?? null,
      created_at: new Date().toISOString(),
    });
  } catch {
    /* table optional until migration */
  }
}
