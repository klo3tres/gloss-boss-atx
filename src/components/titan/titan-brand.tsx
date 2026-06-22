import { titanColors } from '@/lib/titan/branding';

type TitanLogoProps = {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  className?: string;
};

const sizes = {
  sm: { box: 'h-8 w-8 text-sm', word: 'text-sm' },
  md: { box: 'h-11 w-11 text-xl', word: 'text-lg' },
  lg: { box: 'h-14 w-14 text-2xl', word: 'text-2xl' },
};

export function TitanLogo({ size = 'md', showWordmark = true, className = '' }: TitanLogoProps) {
  const s = sizes[size];
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className={`${s.box} flex shrink-0 items-center justify-center rounded-xl border font-black shadow-[0_0_24px_var(--titan-glow)]`}
        style={{
          borderColor: titanColors.gold,
          background: titanColors.carbon,
          color: titanColors.goldSoft,
        }}
        aria-hidden
      >
        T
      </div>
      {showWordmark ? (
        <div>
          <p className={`${s.word} font-black uppercase tracking-[0.2em] text-white`}>Titan</p>
          <p className="text-[9px] font-bold uppercase tracking-[0.35em] text-zinc-500">Growth OS</p>
        </div>
      ) : null}
    </div>
  );
}

export function PoweredByTitan({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  return (
    <p
      className={`inline-flex items-center gap-2 font-bold uppercase tracking-[0.22em] text-zinc-600 ${compact ? 'text-[9px]' : 'text-[10px]'} ${className}`}
    >
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded border text-[8px] font-black"
        style={{ borderColor: titanColors.gold, color: titanColors.goldSoft }}
      >
        T
      </span>
      Powered by Titan™
    </p>
  );
}
