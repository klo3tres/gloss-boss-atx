import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { buildReceiptPdfFromContext, resolveReceiptContext } from '@/lib/receipt-resolve';

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

  const ctx = await resolveReceiptContext(admin, id, source ?? undefined);
  if (!ctx) {
    return NextResponse.json(
      { error: 'Receipt not found. Generate a receipt from the work order or complete a payment first.' },
      { status: 404 },
    );
  }

  const pdf = buildReceiptPdfFromContext(ctx);
  const filename = `${ctx.receiptNumber.replace(/[^a-zA-Z0-9-_]/g, '_') || 'receipt'}.pdf`;

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
