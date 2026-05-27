'use client';

import type { ReactNode } from 'react';
import {
  Camera,
  CheckSquare,
  Clock,
  CreditCard,
  FileText,
  History,
  MapPin,
  Phone,
  Receipt,
} from 'lucide-react';

function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function MissionBtn({
  label,
  icon,
  onClick,
  href,
  active,
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  href?: string;
  active?: boolean;
}) {
  const cls =
    'flex min-w-[3.75rem] shrink-0 flex-col items-center gap-0.5 rounded-xl border px-2 py-2 text-[8px] font-black uppercase tracking-wide transition sm:min-w-[4.25rem] sm:text-[9px] ' +
    (active
      ? 'border-gold bg-gold/20 text-gold-soft shadow-[0_0_20px_rgba(212,175,55,0.3)]'
      : 'border-white/15 bg-black/70 text-zinc-300 hover:border-gold/50 hover:text-gold-soft');

  if (href) {
    return (
      <a href={href} className={cls}>
        {icon}
        <span>{label}</span>
      </a>
    );
  }
  return (
    <button type='button' onClick={onClick} className={cls}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

/** Fixed top dispatch bar — mission control for field work orders. */
export function WorkOrderMissionBar({
  guestPhone,
  mapsHref,
  hasPreInspection,
  timerRunning,
}: {
  guestPhone?: string;
  mapsHref?: string;
  hasPreInspection?: boolean;
  timerRunning?: boolean;
}) {
  const tel = guestPhone ? `tel:${guestPhone.replace(/\s/g, '')}` : undefined;

  return (
    <div className='gb-mission-top fixed left-0 right-0 top-16 z-40 border-b border-gold/25 bg-black/95 shadow-[0_8px_32px_rgba(0,0,0,0.85)] backdrop-blur-xl lg:top-14'>
      <div className='mx-auto flex max-w-7xl gap-2 overflow-x-auto px-3 py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        {tel ? <MissionBtn label='Call' icon={<Phone className='h-4 w-4' />} href={tel} /> : null}
        {mapsHref ? <MissionBtn label='Directions' icon={<MapPin className='h-4 w-4' />} href={mapsHref} /> : null}
        <MissionBtn
          label={timerRunning ? 'Timer on' : 'Timer'}
          icon={<Clock className='h-4 w-4' />}
          onClick={() => scrollTo('wo-timer')}
          active={timerRunning}
        />
        <MissionBtn label='Photos' icon={<Camera className='h-4 w-4' />} onClick={() => scrollTo('wo-photos')} />
        <MissionBtn label='Invoice' icon={<FileText className='h-4 w-4' />} onClick={() => scrollTo('wo-invoice')} />
        <MissionBtn label='Payments' icon={<CreditCard className='h-4 w-4' />} onClick={() => scrollTo('wo-payment')} />
        {hasPreInspection ? (
          <MissionBtn label='Checklist' icon={<CheckSquare className='h-4 w-4' />} onClick={() => scrollTo('wo-preinspect')} />
        ) : null}
        <MissionBtn label='Receipt' icon={<Receipt className='h-4 w-4' />} onClick={() => scrollTo('wo-receipt')} />
        <MissionBtn label='Timeline' icon={<History className='h-4 w-4' />} onClick={() => scrollTo('wo-timeline')} />
      </div>
    </div>
  );
}
