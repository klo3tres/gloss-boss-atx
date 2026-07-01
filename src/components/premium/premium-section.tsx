'use client';

import { MotionFade } from '@/components/marketing/motion-fade';
import { PremiumEyebrow } from '@/components/premium/premium-eyebrow';

export function PremiumSection({
  id,
  eyebrow,
  title,
  subtitle,
  children,
  className = '',
  align = 'center',
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  align?: 'center' | 'left';
}) {
  const alignCls = align === 'center' ? 'text-center mx-auto' : 'text-left';
  return (
    <section id={id} className={`gb-marketing-section relative ${className}`}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <MotionFade>
          <div className={`max-w-3xl space-y-3 ${alignCls}`}>
            {eyebrow ? <PremiumEyebrow>{eyebrow}</PremiumEyebrow> : null}
            <h2 className="text-3xl font-black uppercase tracking-tight text-white sm:text-5xl">{title}</h2>
            {subtitle ? <p className="text-sm leading-relaxed text-zinc-400 sm:text-base">{subtitle}</p> : null}
          </div>
        </MotionFade>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}
