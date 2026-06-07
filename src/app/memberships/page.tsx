import Image from 'next/image';
import Link from 'next/link';
import { Sparkles, Trophy, ShieldCheck, type LucideIcon } from 'lucide-react';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { MembershipJoinButton } from './membership-join-button';

export const dynamic = 'force-dynamic';

const LOGO = '/brand/glossboss-official-atx.png';
const MEMBERSHIP_HIGHLIGHTS: Array<{ title: string; body: string; Icon: LucideIcon }> = [
  { title: 'Member pricing', body: 'Automatic discounts when signed in.', Icon: Sparkles },
  { title: 'Loyalty stamps', body: 'Completed services build rewards.', Icon: Trophy },
  { title: 'Priority care', body: 'Recurring shine with real records.', Icon: ShieldCheck },
];

function money(cents: unknown) {
  return `$${((typeof cents === 'number' ? cents : 0) / 100).toFixed(0)}`;
}

function tone(tier: unknown) {
  const t = String(tier ?? '').toLowerCase();
  if (t.includes('silver')) return 'from-zinc-300/20 via-zinc-950 to-black border-zinc-300/35';
  if (t.includes('gold') || t.includes('platinum')) return 'from-gold/25 via-zinc-950 to-black border-gold/45';
  if (t.includes('elite')) return 'from-cyan-300/18 via-zinc-950 to-black border-cyan-200/35';
  return 'from-amber-700/20 via-zinc-950 to-black border-amber-700/40';
}

export default async function MembershipsPage() {
  const admin = tryCreateAdminSupabase();
  const { data } = admin
    ? await admin.from('membership_plans').select('*').eq('archived', false).or('show_on_homepage.eq.true,show_on_services.eq.true').order('price_cents')
    : { data: [] as Record<string, unknown>[] };
  const plans = (data ?? []) as Record<string, unknown>[];

  return (
    <main className='gb-luxury-page min-h-screen bg-background px-4 pb-20 pt-24 text-foreground sm:px-6'>
      <section className='mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center'>
        <div>
          <Image src={LOGO} alt='Gloss Boss ATX' width={360} height={220} className='h-auto w-52 object-contain sm:w-72' priority />
          <p className='mt-6 text-xs font-black uppercase tracking-[0.28em] text-gold-soft'>Gloss Boss Memberships</p>
          <h1 className='mt-3 text-4xl font-black uppercase tracking-tight text-white sm:text-6xl'>
            Save with monthly mobile detailing care.
          </h1>
          <p className='mt-4 max-w-xl text-sm leading-relaxed text-zinc-300 sm:text-base'>
            Lock in member pricing, earn loyalty stamps, and keep your vehicle looking ready without starting from scratch every visit.
          </p>
          <div className='mt-6 flex flex-wrap gap-3'>
            <Link href='#plans' className='rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase tracking-wider text-black'>View memberships</Link>
            <Link href='/book' className='rounded-xl border border-white/15 px-5 py-3 text-xs font-black uppercase tracking-wider text-white'>Book one-time detail</Link>
          </div>
        </div>
        <div className='rounded-3xl border border-gold/20 bg-gradient-to-br from-gold/12 via-black/80 to-black p-6 shadow-[0_0_55px_rgba(212,175,55,0.12)]'>
          <div className='grid gap-3 sm:grid-cols-3'>
            {MEMBERSHIP_HIGHLIGHTS.map(({ title, body, Icon }) => (
              <div key={title} className='rounded-2xl border border-white/10 bg-black/45 p-4'>
                <Icon className='h-6 w-6 text-gold-soft' />
                <p className='mt-3 text-sm font-black uppercase text-white'>{title}</p>
                <p className='mt-1 text-xs text-zinc-400'>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id='plans' className='mx-auto mt-10 max-w-6xl'>
        <div className='grid gap-5 lg:grid-cols-4'>
          {plans.length === 0 ? (
            <div className='rounded-2xl border border-dashed border-white/10 p-8 text-center text-zinc-400 lg:col-span-4'>
              Membership plans are being finalized. Book a one-time detail or check back soon.
            </div>
          ) : null}
          {plans.map((p) => {
            const benefits = Array.isArray(p.benefits) ? p.benefits : [];
            const included = Array.isArray(p.included_services) ? p.included_services : [];
            return (
              <article key={String(p.id)} className={`rounded-3xl border bg-gradient-to-br p-5 shadow-[0_0_35px_rgba(212,175,55,0.08)] ${tone(p.tier)}`}>
                <p className='text-xs font-black uppercase tracking-[0.24em] text-gold-soft'>{String(p.tier ?? '')}</p>
                <h2 className='mt-2 text-3xl font-black uppercase text-white'>{String(p.name ?? 'Membership')}</h2>
                <p className='mt-3 text-4xl font-black text-white'>{money(p.price_cents)}<span className='text-sm font-bold text-zinc-400'> / {String(p.billing_interval ?? 'month')}</span></p>
                {Number(p.discount_percent ?? 0) > 0 ? <p className='mt-2 text-sm font-bold text-emerald-300'>{Number(p.discount_percent)}% member discount</p> : null}
                <ul className='mt-5 space-y-2 text-sm text-zinc-200'>
                  {benefits.map((b) => <li key={String(b)} className='flex gap-2'><span className='text-gold-soft'>*</span>{String(b)}</li>)}
                  {included.map((b) => <li key={String(b)} className='flex gap-2'><span className='text-gold-soft'>+</span>{String(b)}</li>)}
                </ul>
                <p className='mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-xs text-zinc-400'>Loyalty benefit: earn stamps toward configurable Gloss Boss rewards.</p>
                <div className='mt-5 space-y-2'>
                  <MembershipJoinButton planId={String(p.id)} />
                  <Link href='/book' className='block rounded-xl border border-white/15 px-5 py-3 text-center text-xs font-black uppercase tracking-wider text-white'>Book one-time detail</Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
