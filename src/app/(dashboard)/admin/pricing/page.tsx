import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { PromotionsAdminClient } from '@/components/admin/promotions-admin-client';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { parsePromotionAdminRow } from '@/lib/promotion-admin';

export const dynamic = 'force-dynamic';

export default async function AdminPricingPage() {
  const supabase = await createSupabaseServerClient();
  const promotionRows = supabase
    ? (await supabase.from('offers').select('*').order('sort_order', { ascending: true })).data?.map((r) =>
        parsePromotionAdminRow(r as Record<string, unknown>),
      ) ?? []
    : [];

  return (
    <DashboardShell
      title='Pricing & promotions'
      subtitle='CMS promotions apply on the homepage, services page, and booking. Sitewide percent promos and multi-car defaults still live in Site content (deal_config).'
      role='admin'
    >
      {!supabase ? (
        <p className='mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100'>
          Supabase session unavailable — reload or check environment. You can still open{' '}
          <Link href='/admin/cms' className='text-gold-soft underline'>
            Site content
          </Link>
          .
        </p>
      ) : null}

      <p className='mb-4 text-sm text-zinc-400'>
        Package prices are managed in the live services catalog, not in a browser-only pricing scratchpad. Use{' '}
        <Link href='/admin/cms' className='font-bold text-gold-soft underline'>
          Site content
        </Link>{' '}
        for sitewide booking %, multi-car %, and other homepage_content keys.
      </p>

      <PromotionsAdminClient initialRows={promotionRows} heading='Promotions & deals' />

      <p className='mt-6 text-xs text-zinc-500'>
        <Link href='/admin' className='font-bold uppercase tracking-wider text-gold-soft underline'>
          ← Admin overview
        </Link>
      </p>
    </DashboardShell>
  );
}
