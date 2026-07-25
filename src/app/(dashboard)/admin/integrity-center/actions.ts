'use server';
import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
export async function repairCustomerLinkAction(appointmentId:string){
 const s=await getSessionWithProfile();const admin=tryCreateAdminSupabase();if(!s.user||!isAdminLevel(s.profile?.role??null)||!admin)return{error:'Unauthorized'};
 const {data:appointment}=await admin.from('appointments').select('id,customer_id,guest_email').eq('id',appointmentId).maybeSingle();
 if(!appointment||appointment.customer_id)return{error:'Appointment is missing or already linked.'};const email=String(appointment.guest_email??'').trim().toLowerCase();if(!email)return{error:'No customer email is available for a safe match.'};
 const {data:customers}=await admin.from('customers').select('id,email').ilike('email',email).limit(2);if((customers??[]).length!==1)return{error:'Repair requires exactly one matching customer.'};
 const customerId=String(customers![0].id);const before={appointment_id:appointmentId,customer_id:null,guest_email:email};
 const {data:log,error:logError}=await admin.from('business_integrity_repairs').insert({issue_key:'missing_customer_account_linkage',related_records:[{table:'appointments',id:appointmentId},{table:'customers',id:customerId}],repair_action:'Link appointment to the unique customer with the same normalized email.',status:'confirmed',sensitive:true,before_state:before,confirmed_by:s.user.id,confirmed_at:new Date().toISOString()}).select('id').single();if(logError)return{error:logError.message};
 const {error}=await admin.from('appointments').update({customer_id:customerId,updated_at:new Date().toISOString()}).eq('id',appointmentId).is('customer_id',null);
 await admin.from('business_integrity_repairs').update(error?{status:'failed',error_message:error.message}:{status:'completed',after_state:{appointment_id:appointmentId,customer_id:customerId},completed_at:new Date().toISOString()}).eq('id',log.id);
 if(error)return{error:error.message};revalidatePath('/admin/integrity-center');return{ok:true};
}

