import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import {
  buildReceiptPdfFromContext,
  canonicalInvoiceNumber,
  resolveReceiptContext,
} from '@/lib/receipt-resolve';
import { customerOwnsWorkOrder } from '@/lib/customer-account';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  const role = session.profile?.role ?? null;
  const allowed = session.user && (isAdminLevel(role) || role === 'technician' || role === 'customer');
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const url = new URL(request.url);
  const source = url.searchParams.get('source') ?? undefined;

  let ctx;
  try {
    ctx = await resolveReceiptContext(admin, id, source ?? undefined, {
      autoCreateReceipt: role !== 'customer',
    });
  } catch (error) {
    console.error('[document pdf] resolve failed', error);
    return NextResponse.json(
      { error: 'This document is temporarily unavailable. Please try again.' },
      { status: 503 },
    );
  }
  if (!ctx) {
    return NextResponse.json(
      { error: 'Receipt not found. Generate a receipt from the work order or complete a payment first.' },
      { status: 404 },
    );
  }
  if (
    role === 'customer' &&
    !(await customerOwnsWorkOrder(admin, {
      authUserId: session.user!.id,
      email: session.user!.email ?? '',
      customerId: ctx.job.customer_id,
      guestEmail: ctx.job.guest_email,
    }))
  ) {
    return NextResponse.json({ error: 'This document is not connected to your account.' }, { status: 403 });
  }

  const requestedKind = url.searchParams.get('document');
  const isInvoice =
    requestedKind === 'invoice' ||
    (requestedKind !== 'receipt' && ctx.pricing.remainingBalanceCents > 0);
  const documentNumber = isInvoice
    ? canonicalInvoiceNumber(ctx.workOrderId)
    : ctx.receiptNumber;
  let pdf;
  try {
    pdf = await buildReceiptPdfFromContext(
      ctx,
      admin,
      documentNumber,
      isInvoice ? 'invoice' : 'receipt',
    );
  } catch (error) {
    console.error('[document pdf] render failed', error);
    return NextResponse.json(
      { error: 'This document is temporarily unavailable. Please try again.' },
      { status: 503 },
    );
  }
  const filename = `${documentNumber.replace(/[^a-zA-Z0-9-_]/g, '_') || (isInvoice ? 'invoice' : 'receipt')}.pdf`;
  const disposition = url.searchParams.get('view') === '1' ? 'inline' : 'attachment';

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
