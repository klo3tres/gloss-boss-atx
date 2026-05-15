import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';

export default function LegacyCustomerRoutePage() {
  return (
    <DashboardShell title='Customer dashboard' subtitle='Primary customer home lives at /dashboard — this route stays for older bookmarks.' role='customer'>
      <p className='rounded-2xl border border-gold/20 bg-zinc-950 p-6 text-zinc-300'>
        Open your live dashboard at{' '}
        <Link className='font-bold text-gold-soft underline' href='/dashboard'>
          /dashboard
        </Link>
        .
      </p>
    </DashboardShell>
  );
}
