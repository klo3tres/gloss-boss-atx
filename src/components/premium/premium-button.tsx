import Link from 'next/link';
import { clsx } from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost';

const styles: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-gold via-gold-soft to-gold text-black shadow-[0_0_28px_rgba(212,175,55,0.28)] hover:brightness-110',
  secondary: 'border border-white/20 bg-black/50 text-white hover:border-gold/40 hover:text-gold-soft',
  ghost: 'border border-gold/30 bg-gold/5 text-gold-soft hover:bg-gold/10',
};

export function PremiumButton({
  href,
  children,
  variant = 'primary',
  className = '',
  onClick,
  type = 'button',
}: {
  href?: string;
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  const cls = clsx(
    'gb-premium-btn inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-[10px] font-black uppercase tracking-[0.16em] transition duration-300',
    styles[variant],
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}
