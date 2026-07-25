import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { OwnerQuoteBuilder } from '@/components/admin/owner-quote-builder';
import { getSessionWithProfile } from '@/lib/auth/session';
import { dashboardShellRoleForProfile } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic='force-dynamic';

export default async function QuotesPage(){
  const session=await getSessionWithProfile(); const admin=tryCreateAdminSupabase();
  let customers:any[]=[];let services:any[]=[];let technicians:any[]=[];let recent:any[]=[];
  if(admin){
    const [c,s,t,q]=await Promise.all([
      admin.from('customers').select('id,full_name,email,phone').order('updated_at',{ascending:false}).limit(500),
      admin.from('services').select('slug,title,name,base_price_cents,duration_minutes,service_prices(price_cents,vehicle_class)').eq('active',true).order('sort_order'),
      admin.from('profiles').select('id,full_name,role').in('role',['technician','admin','super_admin']).order('full_name'),
      admin.from('service_estimates').select('id,status,customer_name,customer_email,customer_phone,total_cents,deposit_cents,estimated_margin_cents,labor_minutes,access_token,appointment_id,created_at').order('created_at',{ascending:false}).limit(25),
    ]);
    customers=c.data??[];services=s.data??[];technicians=t.data??[];recent=q.data??[];
  }
  return <DashboardShell title="Owner Quote Builder" subtitle="Price, protect margin, approve, collect, and convert without duplicate entry." role={dashboardShellRoleForProfile(session.profile?.role??null)}>
    <OwnerQuoteBuilder customers={customers} services={services} technicians={technicians} recent={recent}/>
  </DashboardShell>;
}
