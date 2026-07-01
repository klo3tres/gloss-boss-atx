'use client';

import { useEffect, useRef } from 'react';

/** Silent Google Calendar auto-pull on admin surfaces that don't load the calendar feed. */
export function useGoogleCalendarAutoSync() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void fetch('/api/admin/google-calendar/auto-sync', {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(() => undefined);
  }, []);
}
