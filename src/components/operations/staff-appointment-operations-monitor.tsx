'use client';

import { useEffect } from 'react';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Vercel Hobby only permits daily cron execution. Keep time-sensitive job
 * operations live whenever any authenticated staff dashboard is active, with
 * the daily follow-up cron retained as a fallback sweep.
 */
export function StaffAppointmentOperationsMonitor() {
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      void fetch('/api/admin/automation/missed-job-starts', {
        method: 'POST',
        credentials: 'same-origin',
      }).catch(() => undefined);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    check();
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}
