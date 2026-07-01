'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/toast-provider';

/** One-shot toasts after admin job create / lifecycle (reads URL params then clears them). */
export function WorkOrderFlashToasts() {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    const created = searchParams.get('created');
    const gcal = searchParams.get('gcal');
    if (!created && !gcal) return;
    ran.current = true;

    if (created === '1') {
      toast.success('Job created', 'Titan calendar updated.');
    }
    if (gcal === 'ok') {
      toast.success('Google Calendar', 'Event pushed to Google Calendar.');
    } else if (gcal === 'fail') {
      toast.warning('Google Calendar', 'Job saved but Google Calendar push failed — check connection.');
    }

    const next = new URLSearchParams(searchParams.toString());
    next.delete('created');
    next.delete('gcal');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, toast]);

  return null;
}
