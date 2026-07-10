'use client';

import type { ReactNode } from 'react';
import {
  Camera,
  Clock,
  CreditCard,
  FileText,
  Sparkles,
  Wrench,
} from 'lucide-react';

function MissionBtn({
  label,
  icon,
  onClick,
  active,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  const cls =
    'flex min-w-[4rem] shrink-0 flex-col items-center gap-1 rounded-2xl border px-2.5 py-2.5 text-[8px] font-black uppercase tracking-wide transition sm:min-w-[4.5rem] sm:text-[9px] ' +
    (active
      ? 'border-gold/50 bg-gold/15 text-gold-soft shadow-[0_4px_24px_rgba(212,175,55,0.25)]'
      : 'border-border/80 bg-card/80 text-muted-foreground backdrop-blur-sm hover:border-gold/40 hover:text-foreground');

  return (
    <button type='button' onClick={onClick} className={cls}>
      <span className={active ? 'text-gold-soft' : 'text-muted-foreground'}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/** Fixed top dispatch bar — mission control for field work orders as a premium tab switcher. */
export function WorkOrderMissionBar({
  activeTab,
  onTabChange,
  timerRunning,
  timerLabel,
  timerWarning,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
  timerRunning?: boolean;
  timerLabel?: string | null;
  timerWarning?: string | null;
  hasPreInspection?: boolean;
}) {
  return (
    <div className='gb-mission-top fixed left-0 right-0 top-16 z-40 border-b border-gold/20 bg-background/95 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl lg:top-14'>
      {timerWarning ? (
        <p className='border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-center text-[10px] font-bold text-amber-200'>{timerWarning}</p>
      ) : null}
      <div className='mx-auto flex max-w-7xl gap-2 overflow-x-auto px-3 py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden justify-start md:justify-center'>
        <MissionBtn
          label={timerRunning ? (timerLabel ? `Timer ${timerLabel}` : 'Timer on') : 'Overview'}
          icon={<Clock className='h-4 w-4' />}
          onClick={() => onTabChange('overview')}
          active={activeTab === 'overview'}
        />
        <MissionBtn
          label='Photos'
          icon={<Camera className='h-4 w-4' />}
          onClick={() => onTabChange('photos')}
          active={activeTab === 'photos'}
        />
        <MissionBtn
          label='Payments'
          icon={<CreditCard className='h-4 w-4' />}
          onClick={() => onTabChange('payments')}
          active={activeTab === 'payments'}
        />
        <MissionBtn
          label='Receipt'
          icon={<FileText className='h-4 w-4' />}
          onClick={() => onTabChange('receipt')}
          active={activeTab === 'receipt'}
        />
        <MissionBtn
          label='Growth'
          icon={<Sparkles className='h-4 w-4' />}
          onClick={() => onTabChange('growth')}
          active={activeTab === 'growth'}
        />
        <MissionBtn
          label='Tools'
          icon={<Wrench className='h-4 w-4' />}
          onClick={() => onTabChange('tools')}
          active={activeTab === 'tools'}
        />
      </div>
    </div>
  );
}

