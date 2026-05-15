-- STEP 1: Remove recursive / cross-check profiles RLS (policies that call is_staff/current_role).
-- Self-only policies: users read/insert/update only their own row (auth.uid() = id).

DROP POLICY IF EXISTS "profiles_select_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_row" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own_row" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_row" ON public.profiles;

CREATE POLICY "profiles_select_own_row" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own_row" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own_row" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Other tables still use public.is_staff() / current_role(), which read `profiles`.
-- Ensure those SECURITY DEFINER helpers do not re-enter RLS on `profiles`.
ALTER FUNCTION public.current_role() SET (row_security = off);
ALTER FUNCTION public.is_staff() SET (row_security = off);
ALTER FUNCTION public.is_admin_level() SET (row_security = off);
