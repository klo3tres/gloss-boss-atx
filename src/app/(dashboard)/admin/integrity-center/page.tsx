import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { IntegrityRepairButton } from '@/components/admin/integrity-repair-button';
import { getSessionWithProfile } from '@/lib/auth/session';
import { dashboardShellRoleForProfile } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { displayMoney } from '@/lib/display-format';
export const dynamic='force-dynamic';type R=Record<string,any>;
export default async function IntegrityCenterPage(){
 const session=await getSessionWithProfile();const admin=tryCreateAdminSupabase();const issues:Array<{key:string;title:string;reason:string;impact:number;href:string;record:string;repair?:string}>=[];
 if(admin){const [a,p,r,q,c,n]=await Promise.all([
  admin.from('appointments').select('id,status,customer_id,guest_email,final_total_cents,balance_due_cents,job_completed_at,scheduled_start').limit(5000),
  admin.from('payments').select('id,appointment_id,customer_id,amount_cents,status').limit(5000),
  admin.from('receipts').select('id,appointment_id').limit(5000),
  admin.from('service_estimates').select('id,status,appointment_id,customer_name,total_cents,access_token').eq('status','approved').limit(1000),
  admin.from('customer_campaign_recipients').select('id,booked_at,booked_appointment_id,campaign_id').not('booked_at','is',null).limit(2000),
  admin.from('notification_outbox').select('id,status,provider_message_id,created_at').in('status',['queued','pending']).limit(2000),
 ]);
 const appts=(a.data??[]) as R[],payments=(p.data??[]) as R[];const receiptAppts=new Set((r.data??[]).map((x:R)=>x.appointment_id));const paymentAppts=new Set(payments.map(x=>x.appointment_id).filter(Boolean));
 for(const x of appts){const status=String(x.status??'').toLowerCase();if(['paid','completed'].includes(status)&&Number(x.balance_due_cents??0)>0)issues.push({key:'paid_balance',title:'Paid work order has a remaining balance',reason:'Payment state and work-order balance disagree.',impact:Number(x.balance_due_cents),href:`/admin/work-orders/${x.id}`,record:x.id});
 if((status==='completed'||x.job_completed_at)&&!receiptAppts.has(x.id))issues.push({key:'missing_receipt',title:'Completed job has no receipt',reason:'The customer and ledger lack a final receipt record.',impact:Number(x.final_total_cents??0),href:`/admin/work-orders/${x.id}`,record:x.id});
 if(!x.customer_id&&x.guest_email)issues.push({key:'missing_customer_account_linkage',title:'Appointment is not linked to a customer',reason:'A unique email match can be linked after owner confirmation.',impact:0,href:`/admin/work-orders/${x.id}`,record:x.id,repair:'Link unique email match'});}
 for(const x of payments)if(!x.appointment_id&&!x.customer_id)issues.push({key:'unlinked_payment',title:'Unlinked payment',reason:'Cash exists without an appointment or customer attribution.',impact:Number(x.amount_cents??0),href:`/admin/payments/${x.id}`,record:x.id});
 for(const x of (q.data??[]) as R[])if(!x.appointment_id)issues.push({key:'accepted_quote_without_booking',title:'Accepted quote has no booking',reason:'The quote was accepted but has not entered fulfillment.',impact:Number(x.total_cents??0),href:`/estimate/${x.access_token}`,record:x.id});
 for(const x of (c.data??[]) as R[])if(!x.booked_appointment_id)issues.push({key:'campaign_attribution',title:'Campaign booking lacks appointment attribution',reason:'A booking timestamp exists without a linked appointment.',impact:0,href:'/admin/automation-center',record:x.id});
 const callbackCutoff=Date.now()-60*60000;for(const x of (n.data??[]) as R[])if(new Date(x.created_at).getTime()<callbackCutoff&&!x.provider_message_id)issues.push({key:'queued_without_callback',title:'Queued message has no provider callback',reason:'The message has remained queued for more than one hour.',impact:0,href:'/admin/notifications',record:x.id});
 }
 const totalImpact=issues.reduce((s,x)=>s+x.impact,0);
 return <DashboardShell title="Integrity Center" subtitle="Detect, explain, confirm, repair, and audit business-data inconsistencies." role={dashboardShellRoleForProfile(session.profile?.role??null)}>
  <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs uppercase text-muted-foreground">Open issues</p><p className="mt-2 text-3xl font-black">{issues.length}</p></div><div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs uppercase text-muted-foreground">Estimated impact</p><p className="mt-2 text-3xl font-black">{displayMoney(totalImpact)}</p></div><div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs uppercase text-muted-foreground">Repair policy</p><p className="mt-2 font-black">Confirm sensitive mutations</p></div></section>
  <div className="mt-5 space-y-3">{issues.map((x,i)=><article key={`${x.key}-${x.record}-${i}`} className="rounded-2xl border border-border bg-card p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-[9px] font-black uppercase text-amber-400">{x.key.replaceAll('_',' ')}</p><h2 className="mt-1 font-black">{x.title}</h2><p className="mt-1 text-xs text-muted-foreground">{x.reason}</p><p className="mt-2 font-mono text-[10px] text-muted-foreground">Record {x.record}</p></div><div className="text-right"><p className="font-mono font-black">{displayMoney(x.impact)}</p><div className="mt-2 flex gap-2"><Link href={x.href} className="rounded-lg border border-border px-3 py-2 text-[10px] font-black uppercase">Inspect</Link>{x.repair?<IntegrityRepairButton appointmentId={x.record} label={x.repair}/>:<span className="rounded-lg border border-border px-3 py-2 text-[10px] text-muted-foreground">Manual review required</span>}</div></div></div></article>)}{!issues.length?<p className="rounded-3xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">No supported integrity issues detected in the current production-shaped data.</p>:null}</div>
 </DashboardShell>
}
