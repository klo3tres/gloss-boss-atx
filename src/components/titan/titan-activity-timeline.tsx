import Link from 'next/link';
import type { TitanActivityEvent } from '@/lib/titan/activity-feed';
import { formatChicagoDateTime } from '@/lib/chicago-time';

const KIND_COLORS: Record<string, string> = {
  prospect_discovered: 'bg-blue-500/20 text-blue-300',
  lead_discovered: 'bg-blue-500/20 text-blue-300',
  follow_up_sent: 'bg-purple-500/20 text-purple-300',
  customer_booked: 'bg-emerald-500/20 text-emerald-300',
  forecast_updated: 'bg-cyan-500/20 text-cyan-300',
  outreach_sent: 'bg-orange-500/20 text-orange-300',
  command_executed: 'bg-cyan-500/20 text-cyan-300',
  review_generated: 'bg-pink-500/20 text-pink-300',
  opportunity_queued: 'bg-amber-500/20 text-amber-300',
  revenue_leak_scan: 'bg-red-500/20 text-red-300',
};

function timeLabel(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
  } catch {
    return formatChicagoDateTime(iso);
  }
}

export function TitanActivityTimeline({ events }: { events: TitanActivityEvent[] }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-zinc-950/80 p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Titan Timeline</p>
      <p className="mt-1 text-sm text-zinc-500">Titan at work — live activity across your business.</p>
      <ul className="mt-4 max-h-72 space-y-0 overflow-y-auto">
        {events.length === 0 ? (
          <li className="text-xs text-zinc-600">Activity will appear as Titan discovers leads, sends follow-ups, and executes plans.</li>
        ) : (
          events.map((evt, i) => (
            <li key={evt.id} className="relative flex gap-4 pb-4">
              {i < events.length - 1 ? (
                <span className="absolute left-[5px] top-3 h-full w-px bg-white/10" aria-hidden />
              ) : null}
              <span className="relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-gold shadow-[0_0_8px_rgba(212,175,55,0.6)]" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] text-zinc-500">{timeLabel(evt.occurredAt)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${KIND_COLORS[evt.kind] ?? 'bg-zinc-800 text-zinc-400'}`}
                  >
                    {evt.kind.replace(/_/g, ' ')}
                  </span>
                </div>
                {evt.href ? (
                  <Link href={evt.href} className="mt-1 block text-sm font-bold text-white hover:text-gold-soft">
                    {evt.title}
                  </Link>
                ) : (
                  <p className="mt-1 text-sm font-bold text-white">{evt.title}</p>
                )}
                {evt.detail ? <p className="mt-0.5 text-xs text-zinc-500">{evt.detail}</p> : null}
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
