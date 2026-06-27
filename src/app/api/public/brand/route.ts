import { NextResponse } from 'next/server';
import { loadWorkspaceBrand, publicBrandPayload } from '@/lib/brand/workspace-brand';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const admin = tryCreateAdminSupabase();
    if (!admin) {
      return NextResponse.json({
        businessDisplayName: 'Gloss Boss ATX',
        brandShortName: 'Gloss Boss',
        brandCityLabel: 'Austin, TX',
        logoUrl: '/brand/glossboss-clean-logo.png',
        iconUrl: '/favicon.svg',
        supportEmail: null,
        supportPhone: null,
        websiteUrl: 'https://www.glossbossatx.com',
        publicBookingUrl: 'https://www.glossbossatx.com/book',
      });
    }
    const brand = await loadWorkspaceBrand(admin);
    return NextResponse.json(publicBrandPayload(brand));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
