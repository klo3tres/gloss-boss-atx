import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { DEFAULT_UI_PREFERENCES, parseUserUiPreferences } from '@/lib/user-ui-preferences';

export async function GET() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user?.id || !admin) {
    return NextResponse.json({ preferences: DEFAULT_UI_PREFERENCES, websiteDefault: 'dark' });
  }

  const [{ data: profile }, siteRes] = await Promise.all([
    admin
      .from('profiles')
      .select('theme_preference, ui_accent, ui_sidebar_density, ui_dashboard_density')
      .eq('id', session.user.id)
      .maybeSingle(),
    admin.from('site_settings').select('value').eq('key', 'website_default_theme').maybeSingle(),
  ]);

  const siteRaw = siteRes.data?.value;
  const websiteDefault = siteRaw === 'light' || siteRaw === 'dark' ? siteRaw : 'dark';

  return NextResponse.json({
    preferences: parseUserUiPreferences(profile as Record<string, unknown> | null),
    websiteDefault,
  });
}
