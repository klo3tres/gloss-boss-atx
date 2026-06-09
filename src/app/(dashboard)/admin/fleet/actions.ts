'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { insertAppointmentResilient } from '@/lib/booking-server-shared';
import { resendConfigured, sendResendHtml } from '@/lib/email-send';
import { glossBossEmailLayout } from '@/lib/email/templates/layout';

export async function updateFleetInquiryStatusAction(formData: FormData) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return { error: 'Unauthorized' };
  const id = String(formData.get('id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim() || 'contacted';
  if (!id) return { error: 'Missing ID' };

  await admin.from('fleet_inquiries').update({ status }).eq('id', id);
  revalidatePath('/admin/fleet');
  return { ok: true };
}

export async function updateFleetInquiryDetailsAction(
  id: string,
  updates: {
    status?: string;
    internal_notes?: string | null;
    quote_amount_cents?: number | null;
    quoted_services?: string | null;
    follow_up_date?: string | null;
    assigned_technician_id?: string | null;
    contact_history?: any[] | null;
  }
) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return { error: 'Unauthorized' };
  if (!id) return { error: 'Missing ID' };

  const { error } = await admin.from('fleet_inquiries').update(updates).eq('id', id);
  if (error) {
    console.error('[fleet-actions] update error:', error.message);
    return { error: error.message };
  }
  revalidatePath('/admin/fleet');
  return { ok: true };
}

export async function convertFleetToCustomerAction(id: string) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return { error: 'Unauthorized' };
  if (!id) return { error: 'Missing ID' };

  // Fetch inquiry
  const { data: inquiry, error: getErr } = await admin.from('fleet_inquiries').select('*').eq('id', id).maybeSingle();
  if (getErr || !inquiry) return { error: 'Inquiry not found' };

  // Check if customer already exists
  const { data: existing } = await admin
    .from('customers')
    .select('id')
    .eq('email', inquiry.email)
    .maybeSingle();

  if (existing) {
    // Add contact log
    const updatedHistory = [
      ...(inquiry.contact_history || []),
      {
        date: new Date().toISOString(),
        type: 'system',
        notes: `Attempted customer conversion, but customer profile already exists for email ${inquiry.email}`,
      },
    ];
    await admin.from('fleet_inquiries').update({ contact_history: updatedHistory }).eq('id', id);
    revalidatePath('/admin/fleet');
    return { ok: true, message: 'Customer already exists for this email.' };
  }

  // Insert customer
  const { error: insErr } = await admin.from('customers').insert({
    email: inquiry.email,
    full_name: `${inquiry.contact_name} (${inquiry.company_name})`,
    phone: inquiry.phone || null,
    archived: false,
  });

  if (insErr) {
    return { error: `Failed to create customer: ${insErr.message}` };
  }

  // Update contact history
  const updatedHistory = [
    ...(inquiry.contact_history || []),
    {
      date: new Date().toISOString(),
      type: 'system',
      notes: `Converted to CRM Customer: ${inquiry.contact_name} (${inquiry.company_name})`,
    },
  ];

  await admin.from('fleet_inquiries').update({ contact_history: updatedHistory }).eq('id', id);
  revalidatePath('/admin/fleet');
  revalidatePath('/admin/customers');
  return { ok: true, message: 'Converted to customer successfully.' };
}

export async function convertFleetToWorkOrderAction(id: string, serviceSlug: string, vehicleClass: string) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return { error: 'Unauthorized' };
  if (!id) return { error: 'Missing ID' };

  // Fetch inquiry
  const { data: inquiry, error: getErr } = await admin.from('fleet_inquiries').select('*').eq('id', id).maybeSingle();
  if (getErr || !inquiry) return { error: 'Inquiry not found' };

  // Check if customer exists, if not create them
  let { data: customer } = await admin
    .from('customers')
    .select('id')
    .eq('email', inquiry.email)
    .maybeSingle();

  if (!customer) {
    const { data: newCust, error: insErr } = await admin
      .from('customers')
      .insert({
        email: inquiry.email,
        full_name: `${inquiry.contact_name} (${inquiry.company_name})`,
        phone: inquiry.phone || null,
        archived: false,
      })
      .select('id')
      .single();
    if (!insErr && newCust) {
      customer = newCust;
    }
  }

  const payload: Record<string, any> = {
    guest_name: `${inquiry.contact_name} (${inquiry.company_name})`,
    guest_email: inquiry.email,
    guest_phone: inquiry.phone || '',
    vehicle_description: inquiry.fleet_size ? `Fleet size: ${inquiry.fleet_size}` : 'Fleet vehicles',
    service_slug: serviceSlug || 'fleet-detailing',
    vehicle_class: vehicleClass || 'sedan',
    base_price_cents: inquiry.quote_amount_cents || 0,
    deposit_amount_cents: 0,
    scheduled_start: inquiry.follow_up_date || new Date().toISOString(),
    status: 'pending',
    notes: `Fleet Inquiry Quote conversion. Services quoted: ${inquiry.quoted_services || 'None'}. Client message: ${inquiry.message || 'None'}`,
    customer_id: customer?.id || null,
  };

  if (inquiry.assigned_technician_id) {
    payload.assigned_technician_id = inquiry.assigned_technician_id;
  }

  const { data: appt, error: apptErr } = await insertAppointmentResilient(admin, payload);
  if (apptErr || !appt) {
    return { error: `Failed to create work order: ${apptErr}` };
  }

  const updatedHistory = [
    ...(inquiry.contact_history || []),
    {
      date: new Date().toISOString(),
      type: 'system',
      notes: `Converted to Work Order ID: ${appt.id}`,
    },
  ];

  await admin
    .from('fleet_inquiries')
    .update({
      status: 'won',
      contact_history: updatedHistory,
    })
    .eq('id', id);

  revalidatePath('/admin/fleet');
  revalidatePath('/admin/work-orders');
  return { ok: true, message: 'Work order created successfully.' };
}

export async function sendFleetQuoteEmailAction(id: string) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return { error: 'Unauthorized' };
  if (!id) return { error: 'Missing ID' };

  // Fetch inquiry
  const { data: inquiry, error: getErr } = await admin.from('fleet_inquiries').select('*').eq('id', id).maybeSingle();
  if (getErr || !inquiry) return { error: 'Inquiry not found' };

  if (!resendConfigured()) {
    return { error: 'Email service (Resend) is not configured on this server.' };
  }

  const amountStr = inquiry.quote_amount_cents
    ? `$${(inquiry.quote_amount_cents / 100).toFixed(2)}`
    : 'Custom proposal';

  const bodyHtml = `
    <div style="font-family: sans-serif; color: #ffffff; background-color: #0a0a0a; padding: 24px; border-radius: 12px; border: 1px solid #d4a64d;">
      <h2 style="color: #d4a64d; text-transform: uppercase;">Fleet Care Quote Proposal</h2>
      <p>Hello ${inquiry.contact_name},</p>
      <p>Thank you for requesting a fleet care quote from <strong>Gloss Boss ATX</strong>. We have prepared the following proposal details for <strong>${inquiry.company_name}</strong>:</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 16px;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #27272a; color: #a1a1aa; font-size: 14px;">Services Quoted:</td>
          <td style="padding: 8px; border-bottom: 1px solid #27272a; font-weight: bold; font-size: 14px;">${inquiry.quoted_services || 'Mobile Detailing Care Package'}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #27272a; color: #a1a1aa; font-size: 14px;">Fleet Size:</td>
          <td style="padding: 8px; border-bottom: 1px solid #27272a; font-weight: bold; font-size: 14px;">${inquiry.fleet_size || 'Pending'}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #27272a; color: #a1a1aa; font-size: 14px;">Quote Amount:</td>
          <td style="padding: 8px; border-bottom: 1px solid #27272a; font-weight: bold; color: #d4a64d; font-size: 16px;">${amountStr}</td>
        </tr>
        ${inquiry.follow_up_date ? `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #27272a; color: #a1a1aa; font-size: 14px;">Scheduled/Follow-up:</td>
          <td style="padding: 8px; border-bottom: 1px solid #27272a; font-size: 14px;">${new Date(inquiry.follow_up_date).toLocaleDateString()}</td>
        </tr>
        ` : ''}
      </table>
      ${inquiry.internal_notes ? `<p style="font-size: 14px; font-style: italic; color: #d4d4d8; background: #18181b; padding: 12px; border-radius: 8px; border-left: 3px solid #d4a64d;">Note: ${inquiry.internal_notes}</p>` : ''}
      <p style="margin-top: 24px;">To accept this proposal or discuss scheduling changes, please reply directly to this email or call us at our business line.</p>
      <p style="margin-top: 16px;">Best regards,<br/><strong>The Gloss Boss ATX Team</strong></p>
    </div>
  `;

  const emailHtml = glossBossEmailLayout({
    title: 'Fleet Care Proposal',
    preview: `Quote proposal details for ${inquiry.company_name}`,
    headline: 'Fleet detailing proposal',
    bodyHtml,
  });

  const { ok, error } = await sendResendHtml({
    to: inquiry.email,
    subject: `Gloss Boss ATX Fleet Proposal - ${inquiry.company_name}`,
    html: emailHtml,
  });

  if (!ok) {
    return { error: error || 'Failed to send email' };
  }

  const updatedHistory = [
    ...(inquiry.contact_history || []),
    {
      date: new Date().toISOString(),
      type: 'email',
      notes: `Sent official quote proposal email. Amount: ${amountStr}.`,
    },
  ];

  await admin
    .from('fleet_inquiries')
    .update({
      status: 'quoted',
      contact_history: updatedHistory,
    })
    .eq('id', id);

  revalidatePath('/admin/fleet');
  return { ok: true, message: 'Proposal email sent successfully.' };
}
