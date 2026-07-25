'use server';
import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

async function gate(){const s=await getSessionWithProfile();const admin=tryCreateAdminSupabase();return s.user&&isAdminLevel(s.profile?.role??null)&&admin?{admin,userId:s.user.id}:null}
export async function updateAutonomyPolicyAction(input:{workflow:string;mode:string;spendingLimitCents:number;discountLimitBps:number;audienceLimit:number;approvalThresholdCents:number;emergencyStopped:boolean}){
 const g=await gate();if(!g)return{error:'Unauthorized'};
 const allowed=['observe','recommend','prepare','approval_required','autopilot'];if(!allowed.includes(input.mode))return{error:'Invalid autonomy mode'};
 const {error}=await g.admin.from('titan_autonomy_policies').upsert({workflow:input.workflow,mode:input.mode,spending_limit_cents:Math.max(0,input.spendingLimitCents),discount_limit_bps:Math.max(0,Math.min(10000,input.discountLimitBps)),audience_limit:Math.max(0,input.audienceLimit),approval_threshold_cents:Math.max(0,input.approvalThresholdCents),emergency_stopped:input.emergencyStopped,updated_by:g.userId,updated_at:new Date().toISOString()});
 if(error)return{error:error.message};revalidatePath('/admin/titan/governance');return{ok:true};
}
export async function decideTitanRecommendationAction(id:string,decision:'accepted'|'ignored'|'rejected'){
 const g=await gate();if(!g)return{error:'Unauthorized'};const {error}=await g.admin.from('titan_recommendation_outcomes').update({owner_decision:decision,decided_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id);if(error)return{error:error.message};revalidatePath('/admin/titan/governance');return{ok:true};
}

