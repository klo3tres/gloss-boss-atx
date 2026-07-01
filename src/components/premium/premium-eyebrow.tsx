export function PremiumEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-gold/25 bg-gold/5 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.28em] text-gold-soft">
      {children}
    </span>
  );
}
