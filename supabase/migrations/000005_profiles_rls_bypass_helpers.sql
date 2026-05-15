-- Fix profiles SELECT failing for all users (often super_admin first to notice):
-- Policy `profiles_select_self` uses `public.is_staff()`, which calls `current_role()`,
-- which SELECTs `public.profiles` again under the same RLS session → PostgreSQL can
-- raise "infinite recursion detected in policy for relation profiles" (PostgREST surfaces
-- this as a generic read error → app shows PROFILE_FETCH_ERROR on login).
--
-- SECURITY DEFINER helpers must disable row security for their internal reads.

alter function public.current_role() set (row_security = off);
alter function public.is_staff() set (row_security = off);
alter function public.is_admin_level() set (row_security = off);
