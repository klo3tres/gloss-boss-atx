import { NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { loadEstimateById } from '@/lib/service-estimates';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
 const session=await getSessionWithProfile();if(!session.user||!isStaffRole(session.profile?.role??null))return NextResponse.json({error:'Unauthorized'},{status:401});const admin=tryCreateAdminSupabase();if(!admin)return NextResponse.json({error:'Unavailable'},{status:503});const q=await loadEstimateById(admin,(await params).id);if(!q)return NextResponse.json({error:'Not found'},{status:404});
 const doc=new jsPDF();doc.setFillColor(12,12,12);doc.rect(0,0,210,42,'F');doc.setTextColor(212,175,55);doc.setFontSize(19);doc.text('GLOSS BOSS ATX',18,20);doc.setTextColor(255,255,255);doc.setFontSize(10);doc.text('SERVICE QUOTE',18,29);doc.setTextColor(30,30,30);doc.setFontSize(12);doc.text(`Prepared for ${q.customerName}`,18,56);if(q.vehicleDescription)doc.text(q.vehicleDescription,18,65);let y=82;for(const item of q.lineItems){doc.text(item.label,18,y);doc.text(`$${(item.amountCents/100).toFixed(2)}`,190,y,{align:'right'});y+=9}doc.line(18,y,192,y);y+=12;doc.setFontSize(15);doc.text('Total',18,y);doc.text(`$${(q.totalCents/100).toFixed(2)}`,190,y,{align:'right'});y+=10;doc.setFontSize(10);doc.text(`Deposit: $${(q.depositCents/100).toFixed(2)}`,190,y,{align:'right'});doc.setFontSize(9);doc.setTextColor(90,90,90);doc.text('Internal notes, costs, margins, and staff-only reasoning are intentionally excluded.',18,278);
 const bytes=Buffer.from(doc.output('arraybuffer'));return new NextResponse(bytes,{headers:{'content-type':'application/pdf','content-disposition':`attachment; filename="gloss-boss-quote-${q.id.slice(0,8)}.pdf"`}});
}
