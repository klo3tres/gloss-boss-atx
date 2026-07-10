import { NextResponse } from 'next/server';
import { getVapidPublicKey } from '@/lib/web-push-send';

export async function GET() {
  const key = getVapidPublicKey();
  if (!key) {
    return NextResponse.json({ configured: false, publicKey: null });
  }
  return NextResponse.json({ configured: true, publicKey: key });
}
