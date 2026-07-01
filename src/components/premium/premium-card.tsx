import { clsx } from 'clsx';

export function PremiumCard({
  children,
  className = '',
  hover = true,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={clsx(
        'gb-premium-card rounded-3xl border border-white/10 p-6 sm:p-8',
        hover && 'gb-luxury-card-hover',
        className,
      )}
    >
      {children}
    </div>
  );
}
