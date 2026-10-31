-- ============================================================================
-- Find My Cat — Security Hardening: Coordinate Privacy & Profile Escalation
-- Migration: 20261030220000_harden_cats_profiles_and_webhooks.sql
-- Description:
--   1. Enforces column-level SELECT privileges on `public.cats` so raw
--      `home_location` can never be queried by `anon` or `authenticated` roles
--      even when `status = 'missing'` RLS policy is active for `security_invoker` views.
--   2. Restricts `public.profiles` SELECT RLS so private PII (`phone_number`,
--      `full_name`, `stripe_customer_id`, `revenuecat_customer_id`) is only
--      readable by the profile owner (`auth.uid() = id`) or `service_role`.
--   3. Blocks privilege escalation on `public.profiles` (`is_verified_caretaker`,
--      `is_guardian_subscriber`, `guardian_tier`, `guardian_expires_at`,
--      `revenuecat_customer_id`, `stripe_customer_id`) via both column-level
--      privileges and a BEFORE INSERT OR UPDATE enforcement trigger.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CATS TABLE: COLUMN-LEVEL PRIVACY SHIELD ENFORCEMENT
-- ----------------------------------------------------------------------------
-- Revoke table-wide SELECT so `home_location` is never exposed via PostgREST
REVOKE SELECT ON public.cats FROM anon, authenticated;

-- Grant `anon` SELECT only on the non-sensitive columns exposed by v_public_missing_cats
GRANT SELECT (
    id,
    name,
    breed,
    gender,
    is_neutered,
    age_years,
    coat_colour,
    distinctive_features,
    photo_url,
    status,
    missing_since,
    home_address_approx,
    emergency_phone,
    home_location_jittered
) ON public.cats TO anon;

-- Grant `authenticated` SELECT on all columns EXCEPT `home_location`
GRANT SELECT (
    id,
    owner_id,
    name,
    breed,
    gender,
    is_neutered,
    age_years,
    coat_colour,
    distinctive_features,
    microchip_number,
    photo_url,
    status,
    missing_since,
    home_address_approx,
    home_location_jittered,
    medical_notes,
    emergency_phone,
    created_at,
    updated_at
) ON public.cats TO authenticated;

-- Also ensure `anon` cannot read `exact_location` from `public.sightings`
REVOKE SELECT ON public.sightings FROM anon;
GRANT SELECT (
    id,
    cat_id,
    cat_name_hint,
    photo_url,
    coat_colour,
    collar_description,
    notes,
    approximate_location_name,
    jittered_location,
    jitter_offset_meters,
    is_anonymous,
    status,
    observed_at,
    created_at,
    updated_at
) ON public.sightings TO anon;

-- ----------------------------------------------------------------------------
-- 2. PROFILES TABLE: LOCK DOWN PII & PREVENT PRIVILEGE ESCALATION
-- ----------------------------------------------------------------------------
-- Drop overly permissive public SELECT policy that exposed phone numbers & billing IDs
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Revoke direct table access on profiles from unauthenticated `anon` role
REVOKE ALL ON public.profiles FROM anon;

-- Restrict which columns `authenticated` users may INSERT or UPDATE on their own profile
REVOKE INSERT, UPDATE ON public.profiles FROM authenticated;

GRANT INSERT (
    id,
    full_name,
    display_name,
    avatar_url,
    phone_number,
    neighborhood_name
) ON public.profiles TO authenticated;

GRANT UPDATE (
    full_name,
    display_name,
    avatar_url,
    phone_number,
    neighborhood_name,
    updated_at
) ON public.profiles TO authenticated;

-- Defense-in-depth trigger: block any non-admin / non-service_role attempt to
-- set or mutate privileged entitlement and caretaker columns on `public.profiles`.
CREATE OR REPLACE FUNCTION public.fmc_trg_protect_profile_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
    v_jwt_role TEXT := coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    );
BEGIN
    -- Allow trusted backend / superuser contexts (service_role, postgres, supabase_admin, trigger owner)
    IF current_user IN ('postgres', 'supabase_admin', 'service_role')
       OR v_jwt_role = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.is_verified_caretaker := false;
        NEW.is_guardian_subscriber := false;
        NEW.guardian_tier := 'free';
        NEW.guardian_expires_at := NULL;
        NEW.revenuecat_customer_id := NULL;
        NEW.stripe_customer_id := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.is_verified_caretaker IS DISTINCT FROM OLD.is_verified_caretaker
           OR NEW.is_guardian_subscriber IS DISTINCT FROM OLD.is_guardian_subscriber
           OR NEW.guardian_tier IS DISTINCT FROM OLD.guardian_tier
           OR NEW.guardian_expires_at IS DISTINCT FROM OLD.guardian_expires_at
           OR NEW.revenuecat_customer_id IS DISTINCT FROM OLD.revenuecat_customer_id
           OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
            RAISE EXCEPTION 'Modifying privileged profile attributes is restricted to service_role'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fmc_trg_protect_profile_privileged_columns() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_profiles_protect_privileged_columns ON public.profiles;
CREATE TRIGGER trg_profiles_protect_privileged_columns
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.fmc_trg_protect_profile_privileged_columns();

-- Restrict paid Amber Alert activation RPC to `service_role` only (called by verified stripe-webhook)
REVOKE EXECUTE ON FUNCTION public.activate_amber_alert(uuid, uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_amber_alert(uuid, uuid, text, numeric) TO service_role;
