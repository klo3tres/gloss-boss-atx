'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { MessagePreviewModal } from '@/components/admin/message-preview-modal';
import type { MessageTone } from '@/lib/outbound-message-tones';

export type OutboundPreviewConfig = {
  title: string;
  channel: 'sms' | 'email';
  recipient: string;
  body: string;
  subject?: string;
  contextLabel?: string;
  toneVariants?: Partial<Record<MessageTone, string>>;
  priceCents?: number;
  durationMinutes?: number;
  onSend: (final: { body: string; subject?: string }) => Promise<{ ok?: boolean; error?: string }>;
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

  return (
    <OutboundMessageContext.Provider value={value}>
      {children}
      {config ? (
        <MessagePreviewModal
          open
          title={config.title}
          channel={config.channel}
          recipient={config.recipient}
          body={config.body}
          subject={config.subject}
          contextLabel={config.contextLabel}
          toneVariants={config.toneVariants}
          priceCents={config.priceCents}
          durationMinutes={config.durationMinutes}
          busy={busy}
          onCancel={close}
          onCopy={() => setToast('Copied to clipboard.')}
          onSend={(final) => {
            setBusy(true);
            void config
              .onSend(final)
              .then((res) => {
                if (res.error) setToast(res.error);
                else {
                  setConfig(null);
                  setToast('Message sent.');
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
