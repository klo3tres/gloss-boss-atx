import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';
import { isProtectedOwner } from '@/lib/auth/owner-config';
import { isStaffRole } from '@/lib/auth/roles';
import { getPublicSupabaseEnv } from '@/lib/supabase/env';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveInitialProfileRole } from '@/lib/auth/staff-profile-resolve';

/**
 * Service-role profile sync (browser calls after login/signup):
 * - Missing row → insert (owner → super_admin, everyone else → customer).
 * - Existing row → only promotes owner to super_admin when needed; never demotes staff or overwrites other roles.
 */
export async function POST() {
  const env = getPublicSupabaseEnv();
  if (!env) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          /* ignore read-only cookie context */
        }
      },
    },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user?.id || !user.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: 'Service role not configured', hint: 'Add SUPABASE_SERVICE_ROLE_KEY to .env.local' },
      { status: 503 },
    );
  }

  const emailNorm = user.email.trim().toLowerCase();
  const isOwner = isProtectedOwner(emailNorm, user.id);
  const metaName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '';
  const fullName = metaName || (isOwner ? 'Gloss Boss Owner' : null);
  const now = new Date().toISOString();

  const { data: existing, error: readErr } = await admin.from('profiles').select('id, role').eq('id', user.id).maybeSingle();

  if (readErr) {
    const m = readErr.message ?? '';
    if (/relation|does not exist|Could not find|schema cache|column .* does not exist/i.test(m)) {
      console.warn('[ensure-profile] read_schema_drift', m);
      return NextResponse.json({ ok: false, recoverable: true, error: m }, { status: 200 });
    }
    console.error('[ensure-profile] read', readErr);
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  if (!existing) {
    const role = await resolveInitialProfileRole(admin, { userId: user.id, email: emailNorm });
    const insertAttempts: Record<string, unknown>[] = [
      { id: user.id, full_name: fullName, role, email: emailNorm, updated_at: now },
      { id: user.id, full_name: fullName, role, email: emailNorm },
      { id: user.id, full_name: fullName, role, updated_at: now },
      { id: user.id, full_name: fullName, role },
      { id: user.id, role, updated_at: now },
      { id: user.id, role },
    ];
    let insErr = null as { message: string } | null;
    for (const row of insertAttempts) {
      const r = await admin.from('profiles').insert(row);
      if (!r.error) {
        insErr = null;
        break;
      }
      insErr = r.error;
      const msg = String(r.error.message ?? '');
      if (!/column .* does not exist|schema cache|full_name|updated_at|email|Could not find/i.test(msg)) break;
    }
    if (insErr) {
      const m = String(insErr.message ?? '');
      if (/relation|does not exist|Could not find|schema cache/i.test(m)) {
        console.warn('[ensure-profile] insert_schema_drift', insErr);
        return NextResponse.json({ ok: false, recoverable: true, error: m }, { status: 200 });
      }
      console.error('[ensure-profile] insert', insErr);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    if (role === 'customer') {
      try {
        const { linkAuthUserToCustomer } = await import('@/lib/customer-portal-access');
        const link = await linkAuthUserToCustomer(admin, {
          authUserId: user.id,
          email: emailNorm,
          fullName: fullName ?? undefined,
        });
        if (link.ok && link.customerId) {
          try {
            const { enqueueWelcomeCadence } = await import('@/lib/customer-notification-cadence');
            const appBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://glossbossatx.com';
            const portalLink = `${appBase}/dashboard`;
            const { data: customerRow } = await admin
              .from('customers')
              .select('phone, full_name')
              .eq('id', link.customerId)
              .maybeSingle();
            const c = (customerRow ?? {}) as { phone?: string; full_name?: string };
            await enqueueWelcomeCadence(admin, {
              customerId: link.customerId,
              customerName: c.full_name || fullName || 'there',
              customerPhone: c.phone ?? null,
              customerEmail: emailNorm,
              portalLink: portalLink,
            });
          } catch (e) {
            console.warn('[ensure-profile] welcome cadence skipped', e);
          }
        }
      } catch (e) {
        console.warn('[ensure-profile] customer link on create', e);
      }
    }

    return NextResponse.json({ ok: true, created: true });
  }

  const existingRole = parseAppRole(existing.role);
  if (existingRole && isStaffRole(existingRole)) {
    return NextResponse.json({ ok: true, noop: true, staff: true });
  }

  if (existingRole === 'customer') {
    const expectedStaffRole = await resolveInitialProfileRole(admin, { userId: user.id, email: emailNorm });
    if (isStaffRole(expectedStaffRole)) {
      const now = new Date().toISOString();
      await admin
        .from('profiles')
        .update({ role: expectedStaffRole, active: true, updated_at: now, email: emailNorm })
        .eq('id', user.id);
      return NextResponse.json({ ok: true, repaired: true, role: expectedStaffRole });
    }
  }

  if (isOwner && String(existing.role) !== 'super_admin') {
    const updateAttempts: Record<string, unknown>[] = [
      { role: 'super_admin', updated_at: now, email: emailNorm },
      { role: 'super_admin', email: emailNorm },
      { role: 'super_admin', updated_at: now },
      { role: 'super_admin' },
    ];
    let upErr = null as { message: string } | null;
    for (const patch of updateAttempts) {
      const u = await admin.from('profiles').update(patch).eq('id', user.id);
      if (!u.error) {
        upErr = null;
        break;
      }
      upErr = u.error;
      const msg = String(u.error.message ?? '');
      if (!/column .* does not exist|schema cache|updated_at|email|Could not find/i.test(msg)) break;
    }
    if (upErr) {
      const m = String(upErr.message ?? '');
      if (/relation|does not exist|Could not find|schema cache/i.test(m)) {
        console.warn('[ensure-profile] owner_promote_schema_drift', upErr);
        return NextResponse.json({ ok: false, recoverable: true, error: m }, { status: 200 });
      }
      console.error('[ensure-profile] owner promote', upErr);
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, promoted: true });
  }

  if (String(existing.role) === 'customer') {
    try {
      const { linkAuthUserToCustomer } = await import('@/lib/customer-portal-access');
      await linkAuthUserToCustomer(admin, {
        authUserId: user.id,
        email: emailNorm,
        fullName: fullName ?? undefined,
      });
    } catch (e) {
      console.warn('[ensure-profile] customer link on login', e);
    }
  }

  return NextResponse.json({ ok: true, noop: true });
}
