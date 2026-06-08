import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { addPastJobAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function AddPastJobPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) notFound();
  const { data: techs } = await admin.from('profiles').select('id, full_name, email').in('role', ['technician', 'admin', 'super_admin']).order('full_name');

  return (
    <DashboardShell title='Add past job' subtitle='Enter completed work so revenue, receipts, photos, and customer history all stay connected.' role='admin'>
      <form action={addPastJobAction} className='space-y-5 rounded-3xl border border-gold/20 bg-zinc-950/90 p-5 shadow-[0_0_28px_rgba(212,166,77,0.08)]'>
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4'>
          <div>
            <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Completed Work Entry</p>
            <p className='mt-1 text-sm text-zinc-400'>Creates customer, completed work order, payment, receipt, and work-order photo records.</p>
          </div>
          <Link href='/admin/work-orders' className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-300'>Back to work orders</Link>
        </div>

        <section className='grid gap-3 md:grid-cols-3'>
          <label className='text-xs font-bold uppercase text-zinc-400'>Customer name<input name='customer_name' required className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white' /></label>
          <label className='text-xs font-bold uppercase text-zinc-400'>Email<input name='email' type='email' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white' /></label>
          <label className='text-xs font-bold uppercase text-zinc-400'>Phone<input name='phone' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white' /></label>
          <label className='text-xs font-bold uppercase text-zinc-400 md:col-span-3'>Address<input name='address' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white' /></label>
        </section>

        <section className='grid gap-3 md:grid-cols-3'>
          <label className='text-xs font-bold uppercase text-zinc-400'>Service date<input name='service_date' type='date' required className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white' /></label>
          <label className='text-xs font-bold uppercase text-zinc-400'>Completed at<input name='completed_at' type='datetime-local' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white' /></label>
          <label className='text-xs font-bold uppercase text-zinc-400'>Technician
            <select name='technician_id' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white'>
              <option value=''>Unassigned</option>
              {(techs ?? []).map((tech) => (
                <option key={tech.id} value={tech.id}>{tech.full_name || tech.email}</option>
              ))}
            </select>
          </label>
        </section>

        <section className='grid gap-3 md:grid-cols-3'>
          <label className='text-xs font-bold uppercase text-zinc-400'>Vehicle<input name='vehicle_description' required placeholder='2021 Mercedes C300 Black' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white' /></label>
          <label className='text-xs font-bold uppercase text-zinc-400'>Vehicle type
            <select name='vehicle_class' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white'>
              <option value='sedan'>Sedan</option>
              <option value='suv'>SUV</option>
              <option value='truck'>Truck</option>
              <option value='coupe'>Coupe</option>
              <option value='van'>Van</option>
              <option value='other'>Other</option>
            </select>
          </label>
          <label className='text-xs font-bold uppercase text-zinc-400'>Service
            <select name='service_slug' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white'>
              <option value='exterior-wash'>Exterior wash</option>
              <option value='exterior-detail'>Exterior detail</option>
              <option value='interior-detail'>Interior detail</option>
              <option value='full-detail'>Full detail</option>
              <option value='ceramic-coating'>Ceramic coating</option>
              <option value='past-job'>Other completed work</option>
            </select>
          </label>
        </section>

        <section className='grid gap-3 md:grid-cols-3'>
          <label className='text-xs font-bold uppercase text-zinc-400'>Amount charged ($)<input name='amount_charged' type='number' step='0.01' min='0' required className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white' /></label>
          <label className='text-xs font-bold uppercase text-zinc-400'>Amount paid ($)<input name='amount_paid' type='number' step='0.01' min='0' required className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white' /></label>
          <label className='text-xs font-bold uppercase text-zinc-400'>Payment method
            <select name='payment_method' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white'>
              <option value='cash'>Cash</option>
              <option value='zelle'>Zelle</option>
              <option value='stripe'>Stripe</option>
              <option value='card'>Card</option>
              <option value='other'>Other</option>
            </select>
          </label>
        </section>

        <section className='grid gap-3 md:grid-cols-2'>
          <label className='text-xs font-bold uppercase text-zinc-400'>Before photo URLs<textarea name='before_photo_urls' rows={4} placeholder='One URL per line' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white' /></label>
          <label className='text-xs font-bold uppercase text-zinc-400'>After photo URLs<textarea name='after_photo_urls' rows={4} placeholder='One URL per line' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white' /></label>
        </section>

        <label className='block text-xs font-bold uppercase text-zinc-400'>Expense notes / internal notes<textarea name='expense_notes' rows={3} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white' /></label>

        <div className='flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/40 p-4'>
          <div className='flex flex-wrap gap-4 text-sm text-zinc-300'>
            <label><input type='checkbox' name='include_revenue' defaultChecked className='mr-2 accent-[var(--gold)]' />Include in revenue</label>
            <label><input type='checkbox' name='send_receipt' className='mr-2 accent-[var(--gold)]' />Mark receipt ready to send</label>
          </div>
          <button className='rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase text-black hover:bg-gold-soft'>Save completed work</button>
        </div>
      </form>
    </DashboardShell>
  );
}
