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

-- ----------------------------------------------------------------------------
-- 3. HARDEN SECURITY DEFINER RPCs (activate_amber_alert & match_sighting_to_missing_cats)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_amber_alert(
    p_cat_id UUID,
    p_user_id UUID,
    p_payment_intent_id TEXT,
    p_broadcast_radius_meters NUMERIC DEFAULT 3218.69 -- 2 miles
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_cat RECORD;
    v_alert_id UUID;
    v_jittered_loc GEOMETRY(Point, 4326);
    v_jwt_role TEXT := coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    );
BEGIN
    -- Defense-in-depth: only trusted backend / service_role may execute paid Amber Alert activation
    IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
       AND COALESCE(v_jwt_role, '') <> 'service_role' THEN
        RAISE EXCEPTION 'activate_amber_alert is restricted to service_role'
            USING ERRCODE = '42501';
    END IF;

    -- Fetch the cat details
    SELECT * INTO v_cat FROM public.cats WHERE id = p_cat_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cat with ID % not found', p_cat_id;
    END IF;

    -- Verify cat ownership when p_user_id is provided
    IF p_user_id IS NOT NULL AND v_cat.owner_id IS NOT NULL AND v_cat.owner_id <> p_user_id THEN
        RAISE EXCEPTION 'User % is not the owner of cat %', p_user_id, p_cat_id
            USING ERRCODE = '42501';
    END IF;

    -- Update cat status to missing
    UPDATE public.cats
    SET status = 'missing',
        missing_since = COALESCE(missing_since, timezone('utc', now())),
        updated_at = timezone('utc', now())
    WHERE id = p_cat_id;

    -- Compute privacy-shielded center for community broadcast (100m-200m annular jitter)
    IF v_cat.home_location_jittered IS NOT NULL THEN
        v_jittered_loc := v_cat.home_location_jittered;
    ELSIF v_cat.home_location IS NOT NULL THEN
        v_jittered_loc := public.fmc_calculate_jittered_point(v_cat.home_location, 100.0, 200.0);
    ELSE
        -- Fallback default (central London)
        v_jittered_loc := ST_SetSRID(ST_MakePoint(-0.0385, 51.5362), 4326);
    END IF;

    -- Create or upgrade community alert to critical Amber Alert
    INSERT INTO public.community_alerts (
        cat_id,
        created_by,
        type,
        title,
        subtitle,
        badge_text,
        photo_url,
        location,
        broadcast_radius_meters,
        status,
        expires_at
    )
    VALUES (
        p_cat_id,
        COALESCE(p_user_id, v_cat.owner_id),
        'missing_alert',
        '🚨 AMBER ALERT: ' || v_cat.name || ' Missing',
        'High-priority 2-mile emergency broadcast. ' || COALESCE(v_cat.distinctive_features, 'Please look out!'),
        'URGENT 2-MILE RADAR',
        v_cat.photo_url,
        v_jittered_loc,
        p_broadcast_radius_meters,
        'critical',
        timezone('utc', now() + interval '72 hours')
    )
    RETURNING id INTO v_alert_id;

    -- Update transaction record if payment intent supplied
    IF p_payment_intent_id IS NOT NULL THEN
        UPDATE public.payment_transactions
        SET status = 'succeeded',
            metadata = metadata || jsonb_build_object('activated_alert_id', v_alert_id),
            updated_at = timezone('utc', now())
        WHERE stripe_payment_intent_id = p_payment_intent_id;
    END IF;

    RETURN v_alert_id;
END;
$$;

-- Restrict paid Amber Alert activation RPC to `service_role` only (called by verified stripe-webhook)
REVOKE EXECUTE ON FUNCTION public.activate_amber_alert(uuid, uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_amber_alert(uuid, uuid, text, numeric) TO service_role;

-- Harden match_sighting_to_missing_cats against sub-meter trilateration of home_location
-- and restrict direct execution to `service_role`.
CREATE OR REPLACE FUNCTION public.match_sighting_to_missing_cats(
    sighting_uuid UUID,
    search_radius_meters DOUBLE PRECISION DEFAULT 1500.0
)
RETURNS TABLE (
    cat_id UUID,
    cat_name TEXT,
    breed TEXT,
    coat_colour TEXT,
    photo_url TEXT,
    owner_id UUID,
    emergency_phone TEXT,
    distance_meters DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    target_location GEOMETRY;
BEGIN
    SELECT exact_location INTO target_location
    FROM public.sightings
    WHERE id = sighting_uuid;

    IF target_location IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        c.id AS cat_id,
        c.name AS cat_name,
        c.breed,
        c.coat_colour,
        c.photo_url,
        c.owner_id,
        c.emergency_phone,
        -- Use privacy-shielded jittered coordinate and coarse 50m rounding
        -- to prevent sub-meter trilateration of private residential home_location
        (ROUND(
            ST_Distance(
                COALESCE(c.home_location_jittered, c.home_location)::geography,
                target_location::geography
            )::numeric / 50.0,
            0
        ) * 50.0)::double precision AS distance_meters
    FROM public.cats c
    WHERE c.status = 'missing'
      AND COALESCE(c.home_location_jittered, c.home_location) IS NOT NULL
      AND ST_DWithin(
          COALESCE(c.home_location_jittered, c.home_location)::geography,
          target_location::geography,
          search_radius_meters
      )
    ORDER BY distance_meters ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.match_sighting_to_missing_cats(uuid, double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_sighting_to_missing_cats(uuid, double precision) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. WAITLIST LEADS & USER FEEDBACK INPUT VALIDATION CONSTRAINTS
-- ----------------------------------------------------------------------------
ALTER TABLE public.waitlist_leads
    DROP CONSTRAINT IF EXISTS chk_waitlist_leads_email_valid,
    DROP CONSTRAINT IF EXISTS chk_waitlist_leads_postcode_len,
    DROP CONSTRAINT IF EXISTS chk_waitlist_leads_role_len,
    DROP CONSTRAINT IF EXISTS chk_waitlist_leads_source_len;

ALTER TABLE public.waitlist_leads
    ADD CONSTRAINT chk_waitlist_leads_email_valid CHECK (
        char_length(email) BETWEEN 3 AND 254
        AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    ),
    ADD CONSTRAINT chk_waitlist_leads_postcode_len CHECK (postcode IS NULL OR char_length(postcode) <= 32),
    ADD CONSTRAINT chk_waitlist_leads_role_len CHECK (role IS NULL OR char_length(role) <= 64),
    ADD CONSTRAINT chk_waitlist_leads_source_len CHECK (char_length(source) <= 64);

ALTER TABLE public.user_feedback
    DROP CONSTRAINT IF EXISTS chk_user_feedback_comment_len,
    DROP CONSTRAINT IF EXISTS chk_user_feedback_tag_len;

ALTER TABLE public.user_feedback
    ADD CONSTRAINT chk_user_feedback_comment_len CHECK (char_length(comment) <= 2000),
    ADD CONSTRAINT chk_user_feedback_tag_len CHECK (tag IS NULL OR char_length(tag) <= 64);

-- ----------------------------------------------------------------------------
-- 5. POSTGIS PRIVACY SHIELD VOLATILITY, 100M-200M BOUNDS, RADAR EXPIRY & RLS
-- ----------------------------------------------------------------------------
-- Mark fmc_calculate_jittered_point VOLATILE (since it invokes random()) so
-- PostgreSQL never caches a single random sample across multi-row statements.
ALTER FUNCTION public.fmc_calculate_jittered_point(geometry, double precision, double precision) VOLATILE;

-- Align sightings Privacy Shield trigger to 100m-200m annular bounds
CREATE OR REPLACE FUNCTION public.fmc_trg_sightings_privacy_shield()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
    IF NEW.exact_location IS NOT NULL THEN
        IF TG_OP = 'INSERT' OR (NEW.exact_location IS DISTINCT FROM OLD.exact_location) OR NEW.jittered_location IS NULL THEN
            NEW.jittered_location := public.fmc_calculate_jittered_point(NEW.exact_location, 100.0, 200.0);
            NEW.jitter_offset_meters := round(ST_Distance(NEW.exact_location::geography, NEW.jittered_location::geography))::integer;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- Filter expired Amber Alerts (expires_at <= now()) from get_community_radar
CREATE OR REPLACE FUNCTION public.get_community_radar(
    user_longitude DOUBLE PRECISION,
    user_latitude DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION DEFAULT 3218.69
)
RETURNS TABLE (
    id UUID,
    blip_type TEXT,
    title TEXT,
    subtitle TEXT,
    badge_text TEXT,
    photo_url TEXT,
    status TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    distance_miles DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    center_point GEOGRAPHY;
BEGIN
    center_point := ST_SetSRID(ST_MakePoint(user_longitude, user_latitude), 4326)::geography;

    RETURN QUERY
    SELECT
        a.id,
        a.type AS blip_type,
        a.title,
        coalesce(a.subtitle, '') AS subtitle,
        coalesce(a.badge_text, 'URGENT ALERT') AS badge_text,
        a.photo_url,
        a.status,
        ST_Y(a.location) AS latitude,
        ST_X(a.location) AS longitude,
        ROUND((ST_Distance(a.location::geography, center_point) / 1609.344)::numeric, 1)::double precision AS distance_miles
    FROM public.community_alerts a
    WHERE a.status IN ('critical', 'active')
      AND (a.expires_at IS NULL OR a.expires_at > timezone('utc', now()))
      AND ST_DWithin(a.location::geography, center_point, radius_meters)

    UNION ALL

    SELECT
        s.id,
        'recent_sighting'::TEXT AS blip_type,
        coalesce('Sighting: ' || s.cat_name_hint, 'Cat Sighting') AS title,
        coalesce(s.approximate_location_name, 'Spotted nearby') AS subtitle,
        'NEW SIGHTING'::TEXT AS badge_text,
        s.photo_url,
        'active'::TEXT AS status,
        ST_Y(s.jittered_location) AS latitude,
        ST_X(s.jittered_location) AS longitude,
        ROUND((ST_Distance(s.jittered_location::geography, center_point) / 1609.344)::numeric, 1)::double precision AS distance_miles
    FROM public.sightings s
    WHERE s.observed_at >= (timezone('utc', now()) - INTERVAL '48 hours')
      AND ST_DWithin(s.jittered_location::geography, center_point, radius_meters)

    UNION ALL

    SELECT
        c.id,
        'tnr_colony'::TEXT AS blip_type,
        c.name AS title,
        coalesce(c.cat_count || ' community cats under daily care', c.description) AS subtitle,
        'TNR SAFE ZONE'::TEXT AS badge_text,
        NULL::TEXT AS photo_url,
        'safe'::TEXT AS status,
        ST_Y(c.location) AS latitude,
        ST_X(c.location) AS longitude,
        ROUND((ST_Distance(c.location::geography, center_point) / 1609.344)::numeric, 1)::double precision AS distance_miles
    FROM public.tnr_colonies c
    WHERE c.is_monitored = true
      AND ST_DWithin(c.location::geography, center_point, radius_meters)

    ORDER BY distance_miles ASC;
END;
$$;

-- Tighten sightings SELECT RLS so device_token IS NOT NULL does not grant wildcard read access
DROP POLICY IF EXISTS "Reporters can view their submitted sightings" ON public.sightings;
CREATE POLICY "Reporters can view their submitted sightings"
    ON public.sightings FOR SELECT
    USING (auth.uid() = reporter_id);
