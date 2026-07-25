'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { calculateOwnerQuote, type OwnerQuoteInput } from '@/lib/quotes/owner-quote';
import {
  buildEstimateEmailSubject, buildEstimateSmsBody, createAppointmentFromEstimate, loadEstimateById,
  sendEstimateEmailWithBody, sendEstimateSmsWithBody, startEstimateDepositCheckout,
} from '@/lib/service-estimates';
import { getAppOrigin } from '@/lib/env/app-origin';
import { runGoogleCalendarSync } from '@/lib/google/google-calendar-sync';
import { recordManualPaymentActionState } from '@/app/(dashboard)/admin/payment-ops-actions';

type SaveInput = {
  customerId?:string; prospect:{name:string;email?:string;phone?:string}; serviceSlug:string;
  vehicles:Array<{description:string;size:string}>; pricing:OwnerQuoteInput; preferredStart?:string;
  technicianId?:string; notes?:string;
};

async function requireOwner(){
  const session=await getSessionWithProfile(); const admin=tryCreateAdminSupabase();
  if(!session.user||!isAdminLevel(session.profile?.role??null)||!admin)return null;
  return {admin,userId:session.user.id};
}
async function event(admin:any,estimateId:string,type:string,actorId?:string,extra:Record<string,unknown>={}){
 await admin.from('service_estimate_events').insert({estimate_id:estimateId,event_type:type,actor_id:actorId??null,channel:extra.channel??null,provider_status:extra.provider_status??null,related_record:extra.related_record??{},details:extra.details??{},error_message:extra.error_message??null});
}

export async function saveOwnerQuoteAction(input:SaveInput){
  const gate=await requireOwner(); if(!gate)return {error:'Unauthorized'};
  if(!input.customerId&&!input.prospect.name.trim())return {error:'Choose a customer or enter a prospect name.'};
  if(!input.serviceSlug)return {error:'Choose a service.'};
  const calculation=calculateOwnerQuote(input.pricing);
  let customer={full_name:input.prospect.name,email:input.prospect.email??null,phone:input.prospect.phone??null};
  if(input.customerId){
    const found=await gate.admin.from('customers').select('full_name,email,phone').eq('id',input.customerId).maybeSingle();
    if(found.data)customer=found.data as typeof customer;
  }
  const now=new Date().toISOString();
  const token=crypto.randomUUID().replaceAll('-','');
  const {data,error}=await gate.admin.from('service_estimates').insert({
    customer_id:input.customerId||null,access_token:token,status:'draft',
    customer_name:customer.full_name||input.prospect.name||'Customer',customer_email:customer.email||input.prospect.email||null,
    customer_phone:customer.phone||input.prospect.phone||null,service_slug:input.serviceSlug,
    vehicle_class:input.pricing.vehicleSize,vehicle_description:input.vehicles.map(v=>v.description).filter(Boolean).join(', ')||null,
    vehicles:input.vehicles,pricing_inputs:input.pricing,pricing_breakdown:calculation,warnings:calculation.warnings,
    line_items:[
      {label:'Catalog services',amountCents:calculation.catalogCents},
      {label:'Condition adjustment',amountCents:calculation.conditionSurchargeCents},
      {label:'Add-ons',amountCents:calculation.addOnCents},
      {label:'Travel',amountCents:calculation.travelFeeCents},
      {label:'Tax',amountCents:calculation.taxCents},
    ],subtotal_cents:calculation.taxableCents,discount_cents:calculation.discountCents,total_cents:calculation.totalCents,
    deposit_cents:calculation.depositCents,labor_minutes:calculation.laborMinutes,estimated_cost_cents:calculation.estimatedCostCents,
    estimated_margin_cents:calculation.estimatedMarginCents,minimum_profitable_cents:calculation.minimumProfitableCents,
    scheduled_start:input.preferredStart||null,assigned_technician_id:input.technicianId||null,notes:input.notes?.trim()||null,
    valid_until:new Date(Date.now()+14*86400000).toISOString(),created_by:gate.userId,updated_at:now,
  }).select('id,access_token').single();
  if(error)return {error:error.message};
  await event(gate.admin,String(data.id),'created',gate.userId,{details:{total_cents:calculation.totalCents,deposit_cents:calculation.depositCents}});
  revalidatePath('/admin/quotes');
  return {ok:true,id:String(data.id),publicUrl:`/estimate/${data.access_token}`};
}

export async function quoteLifecycleAction(input:{id:string;action:'duplicate'|'expire'|'void'|'accept'|'decline';reason?:string}){
 const g=await requireOwner();if(!g)return{error:'Unauthorized'};const quote=await loadEstimateById(g.admin,input.id);if(!quote)return{error:'Quote not found'};const now=new Date().toISOString();
 if(input.action==='duplicate'){const {data,error}=await g.admin.from('service_estimates').select('*').eq('id',input.id).single();if(error||!data)return{error:error?.message??'Quote not found'};for(const k of ['id','access_token','created_at','updated_at','sent_at','approved_at','declined_at','deposit_paid_at','converted_at','appointment_id','viewed_at','expired_at','voided_at'])delete data[k];Object.assign(data,{status:'draft',access_token:crypto.randomUUID().replaceAll('-',''),created_by:g.userId});const copy=await g.admin.from('service_estimates').insert(data).select('id,access_token').single();if(copy.error)return{error:copy.error.message};await event(g.admin,String(copy.data.id),'duplicated',g.userId,{related_record:{source_estimate_id:input.id}});revalidatePath('/admin/quotes');return{ok:true,id:String(copy.data.id),publicUrl:`/estimate/${copy.data.access_token}`};}
 const patch=input.action==='expire'?{status:'expired',expired_at:now}:input.action==='void'?{status:'voided',voided_at:now,void_reason:input.reason||'Voided by owner'}:input.action==='accept'?{status:'approved',approved_at:now,accepted_at:now}:{status:'declined',declined_at:now,owner_declined_at:now};
 const {error}=await g.admin.from('service_estimates').update({...patch,updated_at:now}).eq('id',input.id);if(error)return{error:error.message};await event(g.admin,input.id,input.action==='accept'?'owner_accepted':input.action,g.userId,{details:{reason:input.reason??null}});revalidatePath('/admin/quotes');return{ok:true};
}

export async function previewOwnerQuoteMessageAction(id:string){
 const g=await requireOwner();if(!g)return{error:'Unauthorized'};const q=await loadEstimateById(g.admin,id);if(!q)return{error:'Quote not found'};await event(g.admin,id,'previewed',g.userId);
 return{quote:q,publicUrl:`/estimate/${q.accessToken}`,sms:buildEstimateSmsBody(q),subject:buildEstimateEmailSubject(q),email:`Hi ${q.customerName},\n\nYour Gloss Boss ATX quote is ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(q.totalCents/100)}. Review and approve securely: ${getAppOrigin()}/estimate/${q.accessToken}`};
}

export async function sendOwnerQuoteAction(input:{id:string;channel:'sms'|'email';subject?:string;body:string;scheduleAt?:string}){
 const g=await requireOwner();if(!g)return{error:'Unauthorized'};const q=await loadEstimateById(g.admin,input.id);if(!q)return{error:'Quote not found'};
 if(input.scheduleAt&&new Date(input.scheduleAt).getTime()>Date.now()){const {error}=await g.admin.from('scheduled_messages').insert({customer_id:q.customerId,channel:input.channel,scheduled_for:new Date(input.scheduleAt).toISOString(),status:'scheduled',subject:input.subject??null,body:input.body,rule_key:`estimate:${q.id}`,payload:{estimate_id:q.id}});if(error)return{error:error.message};await g.admin.from('service_estimates').update({status:'scheduled',scheduled_delivery_at:new Date(input.scheduleAt).toISOString(),updated_at:new Date().toISOString()}).eq('id',q.id);await event(g.admin,q.id,'scheduled',g.userId,{channel:input.channel});return{ok:true};}
 const result=input.channel==='sms'?await sendEstimateSmsWithBody(g.admin,q.id,input.body,getAppOrigin()):await sendEstimateEmailWithBody(g.admin,q.id,{subject:input.subject,body:input.body},getAppOrigin());await event(g.admin,q.id,'sent',g.userId,{channel:input.channel,provider_status:result.ok?'sent':'failed',error_message:result.error});revalidatePath('/admin/quotes');return result;
}

export async function convertOwnerQuoteAction(id:string){
 const g=await requireOwner();if(!g)return{error:'Unauthorized'};const q=await loadEstimateById(g.admin,id);if(!q)return{error:'Quote not found'};if(!['approved','deposit_paid','converted'].includes(q.status))return{error:'Accept the quote before booking.'};
 const appt=await createAppointmentFromEstimate(g.admin,q);if(!appt.ok||!appt.appointmentId)return{error:appt.error??'Booking failed'};let calendarError:string|null=null;try{const sync=await runGoogleCalendarSync(g.admin,appt.appointmentId,'upsert');if(!sync.ok)calendarError=sync.error??'Google Calendar sync failed'}catch(e){calendarError=e instanceof Error?e.message:'Google Calendar sync failed'}
 await g.admin.from('service_estimates').update({status:'converted',converted_at:new Date().toISOString(),appointment_id:appt.appointmentId,updated_at:new Date().toISOString()}).eq('id',id);await event(g.admin,id,'booking_created',g.userId,{related_record:{appointment_id:appt.appointmentId},error_message:calendarError});revalidatePath('/admin/quotes');return{ok:true,appointmentId:appt.appointmentId,calendarError};
}

export async function createOwnerQuotePaymentAction(input:{id:string;kind:'deposit'|'full'|'arrival';customDepositCents?:number}){
 const g=await requireOwner();if(!g)return{error:'Unauthorized'};const q=await loadEstimateById(g.admin,input.id);if(!q)return{error:'Quote not found'};if(input.kind==='arrival'){const appt=await createAppointmentFromEstimate(g.admin,q);if(!appt.ok)return{error:appt.error};await g.admin.from('appointments').update({payment_choice:'pay_later',payment_status:'awaiting_payment'}).eq('id',appt.appointmentId!);await event(g.admin,q.id,'pay_on_arrival_selected',g.userId,{related_record:{appointment_id:appt.appointmentId}});return{ok:true,appointmentId:appt.appointmentId};}
 if(input.customDepositCents!=null)await g.admin.from('service_estimates').update({deposit_cents:input.kind==='full'?q.totalCents:Math.max(0,Math.min(q.totalCents,input.customDepositCents))}).eq('id',q.id);
 const checkout=await startEstimateDepositCheckout(g.admin,q.accessToken,getAppOrigin());await event(g.admin,q.id,input.kind==='full'?'full_payment_requested':'deposit_requested',g.userId,{provider_status:checkout.ok?'checkout_created':'failed',error_message:checkout.error});return checkout;
}

export async function recordOwnerQuoteManualPaymentAction(input:{id:string;amountCents:number;tipCents:number;method:string;reference?:string;note?:string;paidAt?:string;receiptRequested?:boolean}){
 const g=await requireOwner();if(!g)return{error:'Unauthorized'};const q=await loadEstimateById(g.admin,input.id);if(!q)return{error:'Quote not found'};const appt=await createAppointmentFromEstimate(g.admin,q);if(!appt.ok||!appt.appointmentId)return{error:appt.error};const fd=new FormData();fd.set('appointmentId',appt.appointmentId);fd.set('amountDollars',String(input.amountCents/100));fd.set('tipDollars',String(input.tipCents/100));fd.set('method',input.method);fd.set('referenceNumber',input.reference??'');fd.set('note',input.note??'');if(input.paidAt)fd.set('paidAt',input.paidAt);if(input.receiptRequested)fd.set('sendReceipt','true');const result=await recordManualPaymentActionState(null,fd);await event(g.admin,q.id,'payment_received',g.userId,{related_record:{appointment_id:appt.appointmentId},provider_status:result.ok?'succeeded':'failed',error_message:result.error});return result;
}

export async function setOwnerQuoteDecisionAction(id:string,status:'approved'|'declined'){
  const gate=await requireOwner();if(!gate)return{error:'Unauthorized'};
  const now=new Date().toISOString();
  const {error}=await gate.admin.from('service_estimates').update(status==='approved'
    ?{status:'approved',approved_at:now,accepted_at:now,updated_at:now}
    :{status:'declined',declined_at:now,owner_declined_at:now,updated_at:now}).eq('id',id);
  if(error)return{error:error.message};revalidatePath('/admin/quotes');return{ok:true};
}
