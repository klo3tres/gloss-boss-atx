'use client';

import type { ReactNode } from 'react';
import {
  Camera,
  Clock,
  CreditCard,
  FileText,
  User,
  FileSignature,
  MessageSquare,
} from 'lucide-react';

function MissionBtn({
  label,
  icon,
  onClick,
  active,
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  const cls =
    'flex min-w-[3.75rem] shrink-0 flex-col items-center gap-0.5 rounded-xl border px-2 py-2 text-[8px] font-black uppercase tracking-wide transition sm:min-w-[4.25rem] sm:text-[9px] ' +
    (active
      ? 'border-gold bg-gold/20 text-gold-soft shadow-[0_0_20px_rgba(212,175,55,0.3)]'
      : 'border-white/15 bg-black/70 text-zinc-300 hover:border-gold/50 hover:text-gold-soft');

  return (
    <button type='button' onClick={onClick} className={cls}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

/** Fixed top dispatch bar — mission control for field work orders as a premium tab switcher. */
export function WorkOrderMissionBar({
  activeTab,
  onTabChange,
  timerRunning,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
  timerRunning?: boolean;
  hasPreInspection?: boolean;
}) {
  return (
    <div className='gb-mission-top fixed left-0 right-0 top-16 z-40 border-b border-gold/25 bg-black/95 shadow-[0_8px_32px_rgba(0,0,0,0.85)] backdrop-blur-xl lg:top-14'>
      <div className='mx-auto flex max-w-7xl gap-2 overflow-x-auto px-3 py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden justify-start md:justify-center'>
        <MissionBtn
          label={timerRunning ? 'Timer on' : 'Overview'}
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
          label='Customer'
          icon={<User className='h-4 w-4' />}
          onClick={() => onTabChange('customer')}
          active={activeTab === 'customer'}
        />
        <MissionBtn
          label='Vehicle'
          icon={<FileText className='h-4 w-4' />}
          onClick={() => onTabChange('vehicle')}
          active={activeTab === 'vehicle'}
        />
        <MissionBtn
          label='Notes'
          icon={<MessageSquare className='h-4 w-4' />}
          onClick={() => onTabChange('notes')}
          active={activeTab === 'notes'}
        />
        <MissionBtn
          label='Documents'
          icon={<FileSignature className='h-4 w-4' />}
          onClick={() => onTabChange('documents')}
          active={activeTab === 'documents'}
        />
      </div>
    </div>
  );
}
