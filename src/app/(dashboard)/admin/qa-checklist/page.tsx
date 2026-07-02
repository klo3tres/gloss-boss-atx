import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { AdminTitanHero } from '@/components/titan/admin-titan-hero';
import Link from 'next/link';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const CHECKLIST = [
  { step: 1, label: 'Add customer/job from admin', href: '/admin/work-orders/add', verify: 'Success panel shows work order ID + customer linked' },
  { step: 2, label: 'Confirm job saved', href: '/admin/work-orders', verify: 'Job appears in work orders list' },
  { step: 3, label: 'Confirm calendar block', href: '/admin/calendar', verify: 'Blocked slot visible on scheduled date' },
  { step: 4, label: 'Confirm Google Calendar status', href: '/admin/integrations', verify: 'GCal connected; event on success panel' },
  { step: 5, label: 'Confirm owner notification', href: '/admin/notifications', verify: 'Activity Center shows new booking' },
  { step: 6, label: 'Confirm customer confirmation', href: '/admin/work-orders/add', verify: 'Email/SMS status on success panel' },
  { step: 7, label: 'Confirm portal link opens', href: '/admin/work-orders/add', verify: 'Copy portal link → /portal/job opens' },
  { step: 8, label: 'Confirm customer dashboard shows job', href: '/dashboard', verify: 'Customer signs in → appointment visible' },
  { step: 9, label: 'Confirm referral link visible', href: '/dashboard', verify: 'Referral card shows code + link' },
  { step: 10, label: 'Confirm /book?ref=CODE applies discount', href: '/book', verify: 'Referral discount banner on booking wizard' },
  { step: 11, label: 'Confirm job completion unlocks reward', href: '/admin/referrals', verify: 'Referral event → completed; reward pending' },
  { step: 12, label: 'Confirm review request sends', href: '/admin/notifications', verify: 'Review request logged after job complete' },
];

export default async function AdminQaChecklistPage() {
  const session = await getSessionWithProfile();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null)) notFound();

  return (
    <DashboardShell title="QA Checklist" subtitle="Real-customer production flow verification." role="admin">
      <AdminTitanHero
        title="Real customer QA"
        sentence="Run this checklist after every production deploy or Add Job fix."
        kpi={12}
        kpiHint="Steps for Emily booking → portal → referral → reward"
        primaryHref="/admin/work-orders/add"
        primaryLabel="Add Job"
      />
      <ol className="space-y-3">
        {CHECKLIST.map((item) => (
          <li key={item.step} className="rounded-2xl border border-white/10 bg-black/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Step {item.step}</p>
                <p className="mt-1 font-bold text-white">{item.label}</p>
                <p className="mt-1 text-xs text-zinc-500">Verify: {item.verify}</p>
              </div>
              <Link href={item.href} className="rounded-xl border border-gold/30 px-4 py-2 text-[10px] font-black uppercase text-gold-soft">
                Open
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </DashboardShell>
  );
}
