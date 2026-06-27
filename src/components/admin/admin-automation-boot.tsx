'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/toast-provider';

/** Runs safe background automation once per admin session: calendar pull + optional lead radar scan. */
export function AdminAutomationBoot({
  leadRadarAutoEnabled,
  lastLeadRadarScanAt,
  scanFrequency,
}: {
  leadRadarAutoEnabled: boolean;
  lastLeadRadarScanAt: string | null;
  scanFrequency: string;
}) {
  const toast = useToast();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const sixHours = 6 * 60 * 60 * 1000;
    const tenMinutes = 10 * 60 * 1000;

    void fetch('/api/admin/google-calendar/auto-sync', {
      method: 'POST',
      credentials: 'same-origin',
    })
      .then((r) => r.json())
      .then((d: { synced?: boolean; error?: string }) => {
        if (d.synced) toast.info('Calendar synced', 'Google Calendar pulled in background.');
        if (d.error && !d.error.includes('not connected')) {
          toast.warning('Calendar sync', d.error);
        }
      })
      .catch(() => undefined);

    const shouldScan =
      leadRadarAutoEnabled &&
      scanFrequency !== 'manual' &&
      (!lastLeadRadarScanAt || Date.now() - new Date(lastLeadRadarScanAt).getTime() >= sixHours);

    if (shouldScan) {
      void fetch('/api/titan/lead-radar/cron-scan', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'admin_login' }),
      })
        .then((r) => r.json())
        .then((d: { ok?: boolean; created?: number; message?: string; error?: string }) => {
          if (d.ok) toast.success('Lead scan complete', d.message ?? `${d.created ?? 0} new prospects.`);
          else if (d.error && !d.error.includes('limit')) toast.warning('Lead scan', d.error);
        })
        .catch(() => undefined);
    }
  }, [leadRadarAutoEnabled, lastLeadRadarScanAt, scanFrequency, toast]);

  return null;
}
