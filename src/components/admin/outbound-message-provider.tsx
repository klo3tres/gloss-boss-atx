'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { MessagePreviewModal } from '@/components/admin/message-preview-modal';
import type { MessageTone } from '@/lib/outbound-message-tones';
import {
  schedulePreviewedMessageAction,
  sendPreviewedEmailAction,
  sendPreviewedSmsAction,
} from '@/app/(dashboard)/admin/outbound-message-actions';

export type OutboundPreviewConfig = {
  title: string;
  channel: 'sms' | 'email';
  channelOptions?: Array<'sms' | 'email'>;
  recipient: string;
  body: string;
  subject?: string;
  contextLabel?: string;
  toneVariants?: Partial<Record<MessageTone, string>>;
  priceCents?: number;
  durationMinutes?: number;
  allowSchedule?: boolean;
  sendLabel?: string;
  kind?: string;
  appointmentId?: string;
  customerId?: string;
  opportunityId?: string;
  entityType?: string;
  entityId?: string;
  onSend?: (final: { body: string; subject?: string; channel: 'sms' | 'email' }) => Promise<{ ok?: boolean; error?: string }>;
  onSchedule?: (final: { body: string; subject?: string; channel: 'sms' | 'email'; scheduledFor: string }) => Promise<{ ok?: boolean; error?: string }>;
};

type Ctx = {
  openPreview: (config: OutboundPreviewConfig) => void;
};

const OutboundMessageContext = createContext<Ctx | null>(null);

export function OutboundMessageProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<OutboundPreviewConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const openPreview = useCallback((c: OutboundPreviewConfig) => {
    setToast(null);
    setConfig(c);
  }, []);

  const close = useCallback(() => {
    if (!busy) setConfig(null);
  }, [busy]);

  const value = useMemo(() => ({ openPreview }), [openPreview]);

  const defaultOnSend = async (final: { body: string; subject?: string; channel: 'sms' | 'email' }) => {
    if (!config) return { error: 'No config' };
    const kind = config.kind ?? `manual_${final.channel}`;
    if (final.channel === 'sms') {
      return sendPreviewedSmsAction({
        to: config.recipient,
        body: final.body,
        kind,
        appointmentId: config.appointmentId,
        customerId: config.customerId,
        entityType: config.entityType,
        entityId: config.entityId,
      });
    }
    return sendPreviewedEmailAction({
      to: config.recipient,
      subject: final.subject ?? config.subject ?? 'Gloss Boss ATX',
      body: final.body,
      kind,
      appointmentId: config.appointmentId,
      customerId: config.customerId,
      entityType: config.entityType,
      entityId: config.entityId,
    });
  };

  const defaultOnSchedule = async (final: {
    body: string;
    subject?: string;
    channel: 'sms' | 'email';
    scheduledFor: string;
  }) => {
    if (!config) return { error: 'No config' };
    return schedulePreviewedMessageAction({
      channel: final.channel,
      to: config.recipient,
      body: final.body,
      subject: final.subject ?? config.subject,
      kind: config.kind ?? `scheduled_${final.channel}`,
      scheduledFor: final.scheduledFor,
      appointmentId: config.appointmentId,
      customerId: config.customerId,
      opportunityId: config.opportunityId,
      entityType: config.entityType,
      entityId: config.entityId,
    });
  };

  return (
    <OutboundMessageContext.Provider value={value}>
      {children}
      {config ? (
        <MessagePreviewModal
          open
          title={config.title}
          channel={config.channel}
          channelOptions={config.channelOptions}
          recipient={config.recipient}
          body={config.body}
          subject={config.subject}
          contextLabel={config.contextLabel}
          toneVariants={config.toneVariants}
          priceCents={config.priceCents}
          durationMinutes={config.durationMinutes}
          allowSchedule={config.allowSchedule !== false}
          sendLabel={config.sendLabel}
          busy={busy}
          onCancel={close}
          onCopy={() => setToast('Copied to clipboard.')}
          onSend={(final) => {
            setBusy(true);
            const handler = config.onSend ?? defaultOnSend;
            void handler(final)
              .then((res) => {
                if (res.error) setToast(res.error);
                else {
                  setConfig(null);
                  setToast('Message sent.');
                }
              })
              .finally(() => setBusy(false));
          }}
          onSchedule={(final) => {
            setBusy(true);
            const handler = config.onSchedule ?? defaultOnSchedule;
            void handler(final)
              .then((res) => {
                if (res.error) setToast(res.error);
                else {
                  setConfig(null);
                  setToast('Message scheduled.');
                }
              })
              .finally(() => setBusy(false));
          }}
        />
      ) : null}
      {toast ? (
        <div className="fixed bottom-4 left-1/2 z-[230] max-w-sm -translate-x-1/2 rounded-xl border border-white/10 bg-zinc-900 px-4 py-2 text-xs text-zinc-200 shadow-lg">
          {toast}
        </div>
      ) : null}
    </OutboundMessageContext.Provider>
  );
}

export function useOutboundPreview() {
  const ctx = useContext(OutboundMessageContext);
  if (!ctx) {
    return {
      openPreview: (_: OutboundPreviewConfig) => {
        console.warn('[outbound-preview] Provider missing — wrap layout with OutboundMessageProvider');
      },
    };
  }
  return ctx;
}
