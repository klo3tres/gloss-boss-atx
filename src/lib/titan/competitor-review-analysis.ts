import type { SupabaseClient } from '@supabase/supabase-js';

export type CompetitorPainPoint =
  | 'overpriced'
  | 'no_show'
  | 'poor_communication'
  | 'bad_interior'
  | 'missed_stains'
  | 'scheduling_issues'
  | 'rude_service'
  | 'slow_response'
  | 'good_but_expensive'
  | 'wanted_mobile';

export type CompetitorAnalysis = {
  painPoints: CompetitorPainPoint[];
  positioning: string;
  messageAngle: string;
  servicePackage: string;
  customerFrustrations: string;
};

const PAIN_RULES: Array<{ pattern: RegExp; point: CompetitorPainPoint }> = [
  { pattern: /overpriced|too expensive|rip off|over charge/i, point: 'overpriced' },
  { pattern: /no show|never showed|didn't show|ghosted/i, point: 'no_show' },
  { pattern: /communication|respond|text back|call back|unprofessional/i, point: 'poor_communication' },
  { pattern: /stain|missed|still dirty|smell|odor|pet hair/i, point: 'missed_stains' },
  { pattern: /schedule|reschedule|late|wait/i, point: 'scheduling_issues' },
  { pattern: /rude|disrespect|attitude/i, point: 'rude_service' },
  { pattern: /slow|took forever|days to/i, point: 'slow_response' },
  { pattern: /good quality|great job but|expensive but worth/i, point: 'good_but_expensive' },
  { pattern: /mobile|come to me|drive to them|shop only/i, point: 'wanted_mobile' },
];

export function analyzeCompetitorReviews(text: string): CompetitorAnalysis {
  const hay = text.toLowerCase();
  const painPoints = new Set<CompetitorPainPoint>();

  if (/overpriced|too expensive|rip off/.test(hay)) painPoints.add('overpriced');
  if (/no show|never showed|didn't show/.test(hay)) painPoints.add('no_show');
  if (/communication|respond|text back|call back/.test(hay)) painPoints.add('poor_communication');
  if (/stain|missed|still dirty|smell|odor|pet hair/.test(hay)) painPoints.add('missed_stains');
  else if (/interior|inside|seats|vacuum/.test(hay) && /bad|terrible|awful/.test(hay)) painPoints.add('bad_interior');
  if (/schedule|reschedule|late|waited/.test(hay)) painPoints.add('scheduling_issues');
  if (/rude|disrespect|attitude/.test(hay)) painPoints.add('rude_service');
  if (/slow|took forever/.test(hay)) painPoints.add('slow_response');
  if (/good.*expensive|great.*but.*price/.test(hay)) painPoints.add('good_but_expensive');
  if (/mobile|come to|drive to shop|had to drop off/.test(hay)) painPoints.add('wanted_mobile');

  const frustrations: string[] = [];
  if (painPoints.has('no_show')) frustrations.push('reliability and showing up on time');
  if (painPoints.has('missed_stains') || painPoints.has('bad_interior')) frustrations.push('interior quality and stain removal');
  if (painPoints.has('poor_communication') || painPoints.has('slow_response')) frustrations.push('clear communication');
  if (painPoints.has('wanted_mobile')) frustrations.push('convenient mobile service');
  if (painPoints.has('overpriced')) frustrations.push('fair pricing for the work done');

  const positioning =
    painPoints.size > 0
      ? `Gloss Boss wins on ${frustrations.slice(0, 3).join(', ') || 'premium mobile service with reliable scheduling'}.`
      : 'Position Gloss Boss as premium mobile detailing with transparent pricing and reliable arrival windows.';

  const messageAngle =
    painPoints.has('no_show')
      ? 'Lead with reliability: "We confirm your window and show up — mobile to your driveway."'
      : painPoints.has('wanted_mobile')
        ? 'Lead with convenience: "We come to you — water/power access is all we need."'
        : painPoints.has('missed_stains')
          ? 'Lead with interior results: "We specialize in interiors, stains, and odor removal."'
          : 'Lead with trust: "Local Austin/Round Rock mobile detail — reviews and before/after on request."';

  const servicePackage =
    painPoints.has('missed_stains') || painPoints.has('bad_interior')
      ? 'Promote Interior Detail + pet hair/odor add-on.'
      : painPoints.has('wanted_mobile')
        ? 'Promote Full Mobile Detail at home.'
        : 'Promote Full Detail with arrival window guarantee.';

  return {
    painPoints: [...painPoints],
    positioning,
    messageAngle,
    servicePackage,
    customerFrustrations: frustrations.join('; ') || 'General quality and trust concerns.',
  };
}

export async function saveCompetitorInsight(
  admin: SupabaseClient,
  input: { competitorName: string; reviewText: string; sourceUrl?: string; notes?: string },
  workspaceKey = 'default',
) {
  const analysis = analyzeCompetitorReviews(input.reviewText);
  const { data, error } = await admin
    .from('titan_competitor_insights')
    .insert({
      workspace_key: workspaceKey,
      competitor_name: input.competitorName,
      source_url: input.sourceUrl ?? null,
      review_text: input.reviewText,
      pain_points: analysis.painPoints,
      positioning: analysis.positioning,
      message_angle: analysis.messageAngle,
      service_package: analysis.servicePackage,
      notes: input.notes ?? analysis.customerFrustrations,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) return { ok: false as const, error: error.message, analysis };
  return { ok: true as const, id: String((data as { id: string }).id), analysis };
}
