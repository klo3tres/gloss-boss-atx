import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { resolveOrderLedger } from '@/lib/order-ledger';
import { ledgerReceiptLines } from '@/lib/receipt-from-ledger';
import { readCustomLineItems } from '@/lib/work-order-line-items';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import type { Row } from '@/lib/work-order-resolve';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await getSessionWithProfile();
  if (!session.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 503 });

  const url = new URL(req.url);
  const appointmentId = url.searchParams.get('appointmentId')?.trim();
  const fallbackBookingId = url.searchParams.get('fallbackBookingId')?.trim();
  const table = fallbackBookingId ? 'booking_fallbacks' : 'appointments';
  const jobId = fallbackBookingId || appointmentId;
  if (!jobId) return NextResponse.json({ error: 'Missing job id' }, { status: 400 });

  const ledger = await resolveOrderLedger(admin, {
    workOrderId: jobId,
    appointmentId: table === 'appointments' ? jobId : undefined,
    fallbackBookingId: table === 'booking_fallbacks' ? jobId : undefined,
  });
  if (!ledger) {
    return NextResponse.json({ ok: false, error: 'Order ledger unavailable' }, { status: 503 });
  }

  const pricing = ledger._pricing;
  const items = readCustomLineItems(ledger._job as Row);

  return NextResponse.json({
    ok: true,
    pricing: {
      vehicleSubtotalCents: pricing.vehicleSubtotalCents,
      addOnSubtotalCents: pricing.addOnSubtotalCents,
      multiCarDiscountCents: pricing.multiCarDiscountCents,
      onlineDiscountCents: pricing.onlineDiscountCents,
      promoDiscountCents: pricing.promoDiscountCents,
      manualDiscountCents: pricing.manualDiscountCents,
      customLineItemsCents: pricing.customLineItemsCents,
      finalTotalCents: ledger.totals.finalTotalCents,
      depositPaidCents: ledger.totals.depositPaidCents,
      totalPaidCents: ledger.totals.totalPaidCents,
      remainingBalanceCents: ledger.totals.balanceDueCents,
    },
    savedItems: items.map((it) => ({
      id: it.id,
      label: it.label,
      kind: it.kind,
      amountCents: it.amountCents,
      quantity: it.quantity,
      notes: it.notes,
    })),
    balanceDueCents: ledger.totals.balanceDueCents,
    receiptPreviewLines: ledgerReceiptLines(ledger, { includeAdmin: true }).map((l) => ({
      label: l.label,
      amount: l.amount,
      tone: l.tone,
    })),
  });
}
