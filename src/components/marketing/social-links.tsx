import Link from 'next/link';

export type SocialLinks = {
  instagramUrl?: string;
  facebookUrl?: string;
  tiktokUrl?: string;
  youtubeUrl?: string;
};

const SOCIAL = [
  { key: 'instagramUrl' as const, label: 'Instagram', short: 'IG' },
  { key: 'facebookUrl' as const, label: 'Facebook', short: 'FB' },
  { key: 'tiktokUrl' as const, label: 'TikTok', short: 'TT' },
  { key: 'youtubeUrl' as const, label: 'YouTube', short: 'YT' },
];

export function SocialLinksRow({
  links,
  className = '',
  size = 'md',
}: {
  links: SocialLinks;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const items = SOCIAL.filter((s) => links[s.key]?.trim());
  if (items.length === 0) return null;

  const btnClass =
    size === 'sm'
      ? 'h-9 w-9 text-[9px]'
      : 'h-10 w-10 text-[10px]';

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {items.map((s) => (
        <a
          key={s.key}
          href={links[s.key]!}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={s.label}
          title={s.label}
          className={`inline-flex ${btnClass} items-center justify-center rounded-xl border border-border bg-card font-black uppercase text-muted-foreground transition hover:border-gold/35 hover:text-gold-soft`}
        >
          {s.short}
        </a>
      ))}
    </div>
  );
}

/** True when at least one social URL is configured. */
export function hasConfiguredSocialLinks(links: SocialLinks | null | undefined): boolean {
  if (!links) return false;
  return SOCIAL.some((s) => Boolean(links[s.key]?.trim()));
}

export function SocialLinksFooter({ links }: { links: SocialLinks }) {
  const items = SOCIAL.filter((s) => links[s.key]?.trim());
  if (items.length === 0) return null;

  return (
    <nav className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold uppercase tracking-wider" aria-label="Social media">
      {items.map((s) => (
        <a key={s.key} href={links[s.key]!} target="_blank" rel="noopener noreferrer" className="text-muted-foreground transition hover:text-gold-soft">
          {s.label}
        </a>
      ))}
    </nav>
  );
}
