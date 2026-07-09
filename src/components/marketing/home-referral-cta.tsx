'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Gift, Users } from 'lucide-react';
import { PremiumButton } from '@/components/premium/premium-button';
import { createSupabaseBrowserClient, isSupabasePublicReady } from '@/lib/supabase/client';

export function HomeReferralCta() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!isSupabasePublicReady()) return;
    const client = createSupabaseBrowserClient();
    if (!client) return;
    let cancelled = false;
    void client.auth.getUser().then(({ data: { user } }) => {
      if (!cancelled) setSignedIn(Boolean(user));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const referralHref = signedIn ? '/dashboard#referrals' : '/login?next=/dashboard';
  const bookHref = '/book?ref=prompt';

  return (
    <section className="gb-referral-section mx-auto max-w-5xl rounded-3xl border px-6 py-10 sm:px-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft">Referral rewards</p>
          <h2 className="gb-band-title mt-2 text-2xl font-black uppercase text-white sm:text-3xl">
            Give 10%, Get 15%
          </h2>
          <p className="gb-band-desc mt-3 text-sm leading-relaxed text-zinc-400">
            Invite a friend. They save on their first detail. You earn rewards after they complete service — tracked in your dashboard.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:min-w-[220px]">
          <PremiumButton href={referralHref} className="w-full justify-center">
            <Gift className="h-4 w-4" /> Get your referral link
          </PremiumButton>
          <Link
            href={bookHref}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gold/30 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-gold-soft transition hover:bg-gold/10"
          >
            <Users className="h-3.5 w-3.5" /> Book with referral code
          </Link>
        </div>
      </div>
    </section>
  );
}
