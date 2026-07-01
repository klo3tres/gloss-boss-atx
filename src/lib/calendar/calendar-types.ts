export type CalendarEventKind = 'appointment' | 'fallback' | 'block' | 'note';

export type CalendarBlockSource = 'titan_appointment' | 'google_calendar' | 'manual' | 'site_note';

export type CalendarFeedItem = {
  id: string;
  kind: CalendarEventKind;
  source: CalendarBlockSource;
  dayKey: string;
  startAt: string;
  endAt: string;
  title: string;
  subtitle?: string;
  note?: string;
  status?: string;
  price?: string;
  href?: string;
  blocksBooking?: boolean;
  googleEventId?: string | null;
  appointmentId?: string | null;
  timeLabel?: string;
};

export type CalendarFeedResponse = {
  ok: true;
  from: string;
  to: string;
  items: CalendarFeedItem[];
  googleSync?: {
    connected: boolean;
    accountEmail?: string | null;
    lastPullAt: string | null;
    lastPushAt: string | null;
    lastSyncAt: string | null;
    lastError: string | null;
  };
  googleAutoPull?: {
    ran: boolean;
    skipped?: boolean;
    skipReason?: 'throttle' | 'lock' | 'not_connected' | 'not_configured';
    imported?: number;
    error?: string;
    lastPullAt?: string | null;
  };
};

export type CalendarFeedRole = 'admin' | 'tech';
