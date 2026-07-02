-- Fix 1: Function search_path mutable
-- The update_updated_at_column() function had no fixed search_path, making it
-- vulnerable to search-path hijacking. Recreate it with an explicit, safe
-- search_path of pg_catalog (only built-in, trusted schema).
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Fix 2 & 3: RLS policies on otp_codes always true
-- The anon_insert_otp and anon_update_otp policies used WITH CHECK (true),
-- which allowed unrestricted INSERT/UPDATE access for anon and authenticated
-- roles — effectively bypassing RLS.
--
-- The otp_codes table is only ever accessed by the email-otp edge function,
-- which uses the SUPABASE_SERVICE_ROLE_KEY. The service role bypasses RLS
-- entirely, so it is unaffected by these policies. The frontend never queries
-- otp_codes directly (confirmed: no client-side references to the table).
--
-- Therefore the correct policy is to DENY all direct anon/authenticated access.
-- We drop the permissive policies and replace them with restrictive ones that
-- only allow access via the service role (which bypasses RLS by design).

-- Drop the permissive INSERT policy.
DROP POLICY IF EXISTS "anon_insert_otp" ON public.otp_codes;

-- Drop the permissive UPDATE policy.
DROP POLICY IF EXISTS "anon_update_otp" ON public.otp_codes;

-- Drop the permissive SELECT policy (also always true — lock it down too).
DROP POLICY IF EXISTS "anon_select_otp" ON public.otp_codes;

-- Re-create restrictive policies. These use USING/WITH CHECK (false) so that
-- no anon or authenticated role can read, insert, or update rows directly.
-- The service role bypasses RLS and is the only path that touches this table.
CREATE POLICY "deny_select_otp"
ON public.otp_codes FOR SELECT
TO anon, authenticated
USING (false);

CREATE POLICY "deny_insert_otp"
ON public.otp_codes FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "deny_update_otp"
ON public.otp_codes FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- No DELETE policy is granted; default-deny applies for anon/authenticated.
