-- ============================================================================
-- Find My Cat — Database Hardening: Views, Search Paths & Function Privileges
-- Migration: 20261022230000_harden_views_functions_security.sql
-- Description:
--   1. Converts public masked views to security_invoker = true (fixes 0010_security_definer_view).
--   2. Ensures public RLS SELECT policy on cats (status='missing') for masked view consumers.
--   3. Pins explicit search_path = public, extensions on all custom stored procedures
--      to protect against search_path hijacking (fixes 0011_function_search_path_mutable).
--   4. Revokes PUBLIC execution from sensitive internal functions (handle_new_user,
--      rls_auto_enable, activate_amber_alert, match_sighting_to_missing_cats).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. VIEWS: SECURITY INVOKER & COMPATIBLE RLS POLICIES
-- ----------------------------------------------------------------------------
-- Ensure public search can read missing cats via masked views
DROP POLICY IF EXISTS "Anyone can view missing cats" ON public.cats;
CREATE POLICY "Anyone can view missing cats"
    ON public.cats FOR SELECT
    USING (status = 'missing');

-- Set security_invoker on masked public views
ALTER VIEW public.v_public_sightings SET (security_invoker = true);
ALTER VIEW public.v_public_missing_cats SET (security_invoker = true);

-- ----------------------------------------------------------------------------
-- 2. FUNCTIONS: IMMUTABLE SEARCH PATH (Protects against search_path injection)
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.fmc_set_updated_at() SET search_path = public, extensions;
ALTER FUNCTION public.match_sighting_to_missing_cats(uuid, double precision) SET search_path = public, extensions;
ALTER FUNCTION public.fmc_trg_community_alerts_privacy_shield() SET search_path = public, extensions;
ALTER FUNCTION public.fmc_trg_sightings_privacy_shield() SET search_path = public, extensions;
ALTER FUNCTION public.get_nearby_sightings(double precision, double precision, double precision, integer) SET search_path = public, extensions;
ALTER FUNCTION public.get_community_radar(double precision, double precision, double precision) SET search_path = public, extensions;
ALTER FUNCTION public.fmc_calculate_jittered_point(geometry, double precision, double precision) SET search_path = public, extensions;
ALTER FUNCTION public.fmc_calculate_jittered_point_seeded(geometry, text, double precision, double precision) SET search_path = public, extensions;
ALTER FUNCTION public.fmc_trg_cats_privacy_shield() SET search_path = public, extensions;
ALTER FUNCTION public.activate_amber_alert(uuid, uuid, text, numeric) SET search_path = public, extensions;
ALTER FUNCTION public.handle_new_user() SET search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- 3. FUNCTION PRIVILEGES: REVOKE EXCESSIVE PUBLIC EXECUTION
-- ----------------------------------------------------------------------------
-- Internal trigger/auth functions should never be directly callable by client roles
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;

-- Paid emergency alerts can only be executed by authenticated users or service role
REVOKE ALL ON FUNCTION public.activate_amber_alert(uuid, uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_amber_alert(uuid, uuid, text, numeric) TO authenticated, service_role;

-- Internal sighting matching logic is restricted from anon direct execution
REVOKE ALL ON FUNCTION public.match_sighting_to_missing_cats(uuid, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_sighting_to_missing_cats(uuid, double precision) TO authenticated, service_role;
