import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { createCustomerAction, deleteCustomerAction, updateCustomerAction } from '@/app/(dashboard)/admin/customer-actions';

export const dynamic = 'force-dynamic';

type CustomerRow = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
};

export default async function AdminCustomersPage() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();

  let rows: CustomerRow[] = [];
  let qErr: string | null = null;
  if (supabase && session.user && isAdminLevel(session.profile?.role ?? null)) {
    const full = await supabase.from('customers').select('id, email, full_name, phone, created_at').order('created_at', { ascending: false }).limit(200);
    if (full.error && /phone|full_name|column .* does not exist|Could not find|schema cache/i.test(full.error.message)) {
      const lean = await supabase.from('customers').select('id, email, created_at').order('created_at', { ascending: false }).limit(200);
      if (lean.error) {
        qErr = lean.error.message;
        console.warn('[CRM_DEBUG_DB]', 'customers_list', lean.error.message);
      } else {
        rows = (lean.data ?? []).map((r) => ({
          ...r,
          full_name: null,
          phone: null,
        })) as CustomerRow[];
      }
    } else if (full.error) {
      qErr = full.error.message;
      console.warn('[CRM_DEBUG_DB]', 'customers_list', full.error.message);
    } else {
      rows = (full.data ?? []) as CustomerRow[];
    }
  }

  const isSuper = session.profile?.role === 'super_admin';

  return (
    <DashboardShell title='Customers' subtitle='CRM records — add, edit, or remove (delete: super admin + confirmation).' role='admin'>
      {qErr ? (
        <p className='mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100'>
          Could not load customers: {qErr}
        </p>
      ) : null}

      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-lg font-bold uppercase text-gold-soft'>Add customer</h2>
        <p className='mt-1 text-xs text-zinc-500'>Creates a CRM row (does not create a login).</p>
        <form action={createCustomerAction} className='mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <label className='block text-xs text-zinc-400 sm:col-span-2'>
            Email
            <input name='email' type='email' required className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          </label>
          <label className='block text-xs text-zinc-400'>
            Full name
            <input name='full_name' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          </label>
          <label className='block text-xs text-zinc-400'>
            Phone
            <input name='phone' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          </label>
          <div className='flex items-end sm:col-span-2 lg:col-span-4'>
            <button type='submit' className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black'>
              Create
            </button>
          </div>
        </form>
      </section>

      <section className='mt-8 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-lg font-bold uppercase text-gold-soft'>Directory</h2>
        <div className='mt-4 overflow-x-auto'>
          <table className='w-full min-w-[960px] border-collapse text-left text-sm'>
            <thead>
              <tr className='border-b border-white/10 text-xs uppercase tracking-wider text-zinc-500'>
                <th className='py-2 pr-2'>Email</th>
                <th className='py-2 pr-2'>Name</th>
                <th className='py-2 pr-2'>Phone</th>
                <th className='py-2 pr-2'>Created</th>
                <th className='py-2'>Save</th>
                <th className='py-2 pl-2'>Remove</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className='border-b border-white/5 align-middle text-zinc-200'>
                  <td className='py-2 pr-2' colSpan={6}>
                    <div className='flex flex-col gap-2 py-2 lg:flex-row lg:items-end lg:gap-3'>
                      <form action={updateCustomerAction} className='flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end'>
                        <input type='hidden' name='id' value={c.id} />
                        <label className='min-w-[200px] flex-1 text-xs text-zinc-500'>
                          Email
                          <input name='email' type='email' required defaultValue={c.email} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-2 py-1.5 text-sm' />
                        </label>
                        <label className='min-w-[140px] text-xs text-zinc-500'>
                          Name
                          <input name='full_name' defaultValue={c.full_name ?? ''} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-2 py-1.5 text-sm' />
                        </label>
                        <label className='min-w-[120px] text-xs text-zinc-500'>
                          Phone
                          <input name='phone' defaultValue={c.phone ?? ''} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-2 py-1.5 text-sm' />
                        </label>
                        <button type='submit' className='rounded-lg border border-gold/40 px-3 py-2 text-xs font-bold uppercase text-gold-soft'>
                          Save
                        </button>
                        <Link href={`/admin/customers/${c.id}`} className='rounded-lg border border-white/15 px-3 py-2 text-xs font-bold uppercase text-zinc-300 hover:border-gold/40'>
                          View detail
                        </Link>
                      </form>
                      {isSuper ? (
                        <form action={deleteCustomerAction} className='flex shrink-0 flex-wrap items-center gap-2'>
                          <input type='hidden' name='id' value={c.id} />
                          <input
                            name='super_confirm'
                            placeholder='DELETE'
                            className='w-24 rounded border border-red-500/30 bg-black px-2 py-1.5 text-xs text-red-200'
                            aria-label='Type DELETE to confirm'
                          />
                          <button type='submit' className='rounded-lg border border-red-500/50 px-2 py-1.5 text-[10px] font-bold uppercase text-red-300 hover:bg-red-500/10'>
                            Delete
                          </button>
                        </form>
                      ) : null}
                    </div>
                    <p className='pb-2 text-[10px] text-zinc-600'>{new Date(c.created_at).toLocaleString()}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !qErr ? <p className='mt-4 text-sm text-zinc-500'>No customers yet.</p> : null}
          {!isSuper ? <p className='mt-4 text-xs text-zinc-600'>Customer delete is restricted to super admins (type DELETE to confirm).</p> : null}
        </div>
      </section>

      <Link href='/admin' className='mt-8 inline-block text-xs font-bold uppercase tracking-wider text-gold-soft underline'>
        ← Admin overview
      </Link>
    </DashboardShell>
  );
}
