import Link from 'next/link';
import { Award, ShieldCheck, Sparkles, Star, Trophy } from 'lucide-react';
import { MarketingSiteFooter } from '@/components/marketing/marketing-site-footer';
import { SocialLinksRow } from '@/components/marketing/social-links';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const metadata = {
  title: 'About Our Craft | Gloss Boss ATX',
  description: 'The story, ethos, and standards of Austin’s premier mobile automotive detailing experts.',
};

export const dynamic = 'force-dynamic';

async function loadSocialLinks() {
  const empty = { instagramUrl: '', tiktokUrl: '', youtubeUrl: '', facebookUrl: '' };
  const admin = tryCreateAdminSupabase();
  if (!admin) return empty;
  const { data } = await admin
    .from('site_settings')
    .select('key, value')
    .in('key', ['social_instagram_url', 'social_tiktok_url', 'social_youtube_url', 'social_facebook_url']);
  const rows = data ?? [];
  return {
    instagramUrl: String(rows.find((r) => r.key === 'social_instagram_url')?.value ?? ''),
    tiktokUrl: String(rows.find((r) => r.key === 'social_tiktok_url')?.value ?? ''),
    youtubeUrl: String(rows.find((r) => r.key === 'social_youtube_url')?.value ?? ''),
    facebookUrl: String(rows.find((r) => r.key === 'social_facebook_url')?.value ?? ''),
  };
}

export default async function AboutPage() {
  const socialLinks = await loadSocialLinks();
  const VALUES = [
    {
      title: 'Craftsman Standards',
      desc: 'We do not rush. Every corner, seam, and crevice is treated with detailing picks and fine microfiber to achieve true perfection.',
      Icon: Award,
    },
    {
      title: 'Completely Self-Powered',
      desc: 'Our bespoke detailing units carry onboard purified spot-free water and silent power generators. We need nothing from your home.',
      Icon: ShieldCheck,
    },
    {
      title: 'Exotics & Luxury Experts',
      desc: 'Trusted to handle multi-million dollar portfolios, rare collectors cars, paint protection films, and modern exotics.',
      Icon: Sparkles,
    },
  ];

  return (
    <main className="gb-marketing-page gb-luxury-page min-h-screen bg-background text-foreground">
      <section className="relative overflow-hidden px-4 pb-16 pt-24 sm:px-8 max-w-5xl mx-auto">
        <div className="gb-premium-hero rounded-3xl p-8 sm:p-12 relative overflow-hidden border border-border">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-gold-soft">Our legacy & purpose</p>
          <h1 className="mt-4 text-4xl sm:text-5xl font-black uppercase tracking-tight text-foreground leading-tight">
            A new standard for{' '}
            <span className="gb-text-gold-gradient">Austin automotive care</span>
          </h1>
          <p className="mt-6 max-w-2xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            Gloss Boss ATX was founded on a simple premise: vehicle detailing should not be a transactional chore.
            It is a meticulous craft that requires patience, elite chemistry, and a refusal to cut corners. We bring
            this museum-grade precision directly to your Austin driveway.
          </p>
          <SocialLinksRow links={socialLinks} className="mt-6" />
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-8 py-12">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-gold-soft">The Gloss Boss way</p>
          <h2 className="mt-2 text-2xl font-black uppercase text-foreground tracking-tight">Our core directives</h2>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {VALUES.map((v) => {
            const Icon = v.Icon;
            return (
              <div key={v.title} className="gb-premium-card rounded-2xl p-6 border border-border">
                <div className="h-11 w-11 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center text-gold-soft mb-4">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-black uppercase text-foreground mb-2">{v.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{v.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-8 pb-16">
        <div className="gb-premium-card rounded-3xl border border-gold/20 p-8 sm:p-10 text-center">
          <Trophy className="mx-auto h-8 w-8 text-gold-soft" />
          <h2 className="mt-4 text-2xl font-black uppercase text-foreground">Built for owners who care</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            From daily drivers to collector exotics, Gloss Boss ATX treats every vehicle like a statement piece.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/book" className="rounded-xl bg-gold px-6 py-3 text-sm font-black uppercase text-black">
              Book a detail
            </Link>
            <Link href="/memberships" className="rounded-xl border border-border px-6 py-3 text-sm font-black uppercase text-foreground">
              View memberships
            </Link>
          </div>
          <div className="mt-6 flex items-center justify-center gap-1 text-gold-soft">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-current" />
            ))}
          </div>
        </div>
      </section>

      <MarketingSiteFooter />
    </main>
  );
}
