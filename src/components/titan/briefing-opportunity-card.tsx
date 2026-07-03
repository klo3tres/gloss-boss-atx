'use client';

import { useRouter } from 'next/navigation';
import { TitanOpportunityCard } from '@/components/titan/titan-page-shell';
import { useOutboundPreview } from '@/components/admin/outbound-message-provider';
import { buildToneVariants } from '@/lib/outbound-message-tones';
import { sendPreviewedSmsAction } from '@/app/(dashboard)/admin/outbound-message-actions';
import { markOpportunityStatusAction } from '@/app/(dashboard)/admin/titan/opportunity-actions';
import type { BriefingOpportunity } from '@/lib/titan/executive-briefing';

export function BriefingOpportunityCard({ opp }: { opp: BriefingOpportunity }) {
  const router = useRouter();
  const { openPreview } = useOutboundPreview();

  const onAutoRun =
    opp.contactPhone && opp.script
      ? () => {
          const tones = buildToneVariants(opp.script!);
          openPreview({
            title: 'Send outreach SMS',
            channel: 'sms',
            recipient: opp.contactPhone!,
            body: tones.professional,
            toneVariants: tones,
            contextLabel: opp.title,
            onSend: async (final) => {
              const res = await sendPreviewedSmsAction({
                to: opp.contactPhone!,
                body: final.body,
                kind: `briefing_${opp.id}`,
                entityType: opp.entityType,
                entityId: opp.entityId,
              });
              if (!res.error && opp.entityType === 'opportunity' && opp.entityId) {
                await markOpportunityStatusAction(opp.entityId, 'contacted');
              }
              if (!res.error) router.refresh();
              return res;
            },
          });
        }
      : undefined;

  return (
    <TitanOpportunityCard
      title={opp.title}
      body={opp.body}
      confidence={opp.confidence}
      confidenceLabel={opp.confidenceLabel}
      revenueLabel={opp.revenueLabel}
      href={opp.href}
      autoRunLabel={opp.autoRunLabel}
      onAutoRun={onAutoRun}
    />
  );
}
