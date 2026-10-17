-- ============================================================================
-- Find My Cat — Supabase PostGIS Database Migration
-- Migration: 20261017211500_privacy_shield_100_200m_jitter.sql
-- Description: Upgrades Privacy Shield to 100m–200m automated differential
--              geo-jittering on owner home addresses, hardens Row-Level Security
--              (RLS) against direct table coordinate leaks, and safeguards
--              broadcasts (Amber Alerts & Radar RPCs) against pet-theft targeting.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. UPDATE CORE JITTER FUNCTIONS (100m–200m Annular Distribution)
-- ----------------------------------------------------------------------------

/**
 * fmc_calculate_jittered_point
 *
 * Applies randomized annular 100m–200m geodesic jittering to protect residential
 * addresses and prevent pet-theft targeting (e.g. pedigree breeds).
 *
 * Mathematical properties:
 * - Annular area distribution: r = sqrt(U * (R_max^2 - R_min^2) + R_min^2)
 *   guarantees uniform point density per unit area across the annulus.
 * - Eliminates zero-distance risk: points never fall within 100m of the residence.
 * - Upper bound of 200m retains critical neighborhood searchability.
 * - Azimuth theta is sampled uniformly in [0, 2*pi).
 * - Geodesic calculation via PostGIS ST_Project on the WGS84 spheroid.
 * - Coordinate snapping to 6 decimal places (~0.1m) prevents entropy fingerprinting.
 */
CREATE OR REPLACE FUNCTION public.fmc_calculate_jittered_point(
    input_point GEOMETRY,
    min_radius_meters DOUBLE PRECISION DEFAULT 100.0,
    max_radius_meters DOUBLE PRECISION DEFAULT 200.0
)
RETURNS GEOMETRY
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    u DOUBLE PRECISION;
    v DOUBLE PRECISION;
    dist_meters DOUBLE PRECISION;
    bearing_rad DOUBLE PRECISION;
    projected_geog GEOGRAPHY;
    jittered_geom GEOMETRY;
BEGIN
    IF input_point IS NULL THEN
        RETURN NULL;
    END IF;

    -- Ensure valid radius bounds
    IF min_radius_meters < 0 OR max_radius_meters < min_radius_meters THEN
        RAISE EXCEPTION 'Invalid jitter parameters: min_radius must be >= 0 and <= max_radius';
    END IF;

    -- Uniform random variables in [0, 1)
    u := random();
    v := random();

    -- Uniform areal distribution within the annulus [min_radius, max_radius]
    dist_meters := sqrt(u * (max_radius_meters^2 - min_radius_meters^2) + min_radius_meters^2);

    -- Uniform random bearing in radians [0, 2*pi)
    bearing_rad := v * 2.0 * pi();

    -- PostGIS ST_Project operates on geography (WGS84 spheroid)
    -- ST_Project(geog, distance_meters, azimuth_radians)
    projected_geog := ST_Project(input_point::geography, dist_meters, bearing_rad);

    -- Convert back to geometry(Point, 4326) and snap to 6 decimal places
    jittered_geom := ST_SetSRID(
        ST_MakePoint(
            round(ST_X(projected_geog::geometry)::numeric, 6)::double precision,
            round(ST_Y(projected_geog::geometry)::numeric, 6)::double precision
        ),
        4326
    );

    RETURN jittered_geom;
END;
$$;

COMMENT ON FUNCTION public.fmc_calculate_jittered_point IS
'Applies randomized annular 100m-200m geodesic jittering to protect residential privacy and guard against pet theft.';

/**
 * fmc_calculate_jittered_point_seeded
 *
 * Deterministic pseudo-random version of the 100m-200m geo-jitter function.
 * Used for reproducible regression testing, audit checks, and deterministic mocking.
 */
CREATE OR REPLACE FUNCTION public.fmc_calculate_jittered_point_seeded(
    input_point GEOMETRY,
    seed_text TEXT,
    min_radius_meters DOUBLE PRECISION DEFAULT 100.0,
    max_radius_meters DOUBLE PRECISION DEFAULT 200.0
)
RETURNS GEOMETRY
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    hash_hex TEXT;
    u DOUBLE PRECISION;
    v DOUBLE PRECISION;
    dist_meters DOUBLE PRECISION;
    bearing_rad DOUBLE PRECISION;
    projected_geog GEOGRAPHY;
BEGIN
    IF input_point IS NULL THEN
        RETURN NULL;
    END IF;

    IF min_radius_meters < 0 OR max_radius_meters < min_radius_meters THEN
        RAISE EXCEPTION 'Invalid jitter parameters: min_radius must be >= 0 and <= max_radius';
    END IF;

    hash_hex := md5(coalesce(seed_text, 'fmc_seed'));
    u := (('x' || substr(hash_hex, 1, 8))::bit(32)::bigint)::double precision / 4294967295.0;
    v := (('x' || substr(hash_hex, 9, 8))::bit(32)::bigint)::double precision / 4294967295.0;

    dist_meters := sqrt(u * (max_radius_meters^2 - min_radius_meters^2) + min_radius_meters^2);
    bearing_rad := v * 2.0 * pi();

    projected_geog := ST_Project(input_point::geography, dist_meters, bearing_rad);

    RETURN ST_SetSRID(
        ST_MakePoint(
            round(ST_X(projected_geog::geometry)::numeric, 6)::double precision,
            round(ST_Y(projected_geog::geometry)::numeric, 6)::double precision
        ),
        4326
    );
END;
$$;

COMMENT ON FUNCTION public.fmc_calculate_jittered_point_seeded IS
'Deterministic 100m-200m pseudo-random geo-jittering function for reproducible testing and auditing.';

-- ----------------------------------------------------------------------------
-- 2. UPDATE TRIGGER LOGIC FOR CATS TABLE
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fmc_trg_cats_privacy_shield()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.home_location IS NOT NULL THEN
        -- Only recompute jitter when inserted, explicitly updated, or if jittered point is missing.
        -- Single-write immutability blocks averaging / trilateration attacks across repeated reads.
        IF TG_OP = 'INSERT'
           OR (NEW.home_location IS DISTINCT FROM OLD.home_location)
           OR NEW.home_location_jittered IS NULL THEN
            NEW.home_location_jittered := public.fmc_calculate_jittered_point(NEW.home_location, 100.0, 200.0);
        END IF;
    ELSE
        NEW.home_location_jittered := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cats_privacy_shield ON public.cats;
CREATE TRIGGER trg_cats_privacy_shield
    BEFORE INSERT OR UPDATE OF home_location
    ON public.cats
    FOR EACH ROW
    EXECUTE FUNCTION public.fmc_trg_cats_privacy_shield();

-- ----------------------------------------------------------------------------
-- 3. BROADCAST PRIVACY SHIELD: COMMUNITY ALERTS AUTO-SANITATION TRIGGER
-- ----------------------------------------------------------------------------

/**
 * fmc_trg_community_alerts_privacy_shield
 *
 * Ensures that any community alert (amber alert / broadcast) associated with a cat
 * strictly anchors its broadcast coordinate to the cat's 100m-200m jittered location.
 * Even if a client inadvertently attempts to submit the raw home address, the database
 * trigger enforces privacy at the SQL level before persisting or broadcasting.
 */
CREATE OR REPLACE FUNCTION public.fmc_trg_community_alerts_privacy_shield()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_cat_jittered GEOMETRY;
BEGIN
    IF NEW.cat_id IS NOT NULL AND NEW.type = 'missing_alert' THEN
        SELECT home_location_jittered INTO v_cat_jittered
        FROM public.cats
        WHERE id = NEW.cat_id;

        IF v_cat_jittered IS NOT NULL THEN
            NEW.location := v_cat_jittered;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_alerts_privacy_shield ON public.community_alerts;
CREATE TRIGGER trg_community_alerts_privacy_shield
    BEFORE INSERT OR UPDATE OF cat_id, type, location
    ON public.community_alerts
    FOR EACH ROW
    EXECUTE FUNCTION public.fmc_trg_community_alerts_privacy_shield();

-- ----------------------------------------------------------------------------
-- 4. HARDEN ROW-LEVEL SECURITY (RLS) ON CATS & SANITIZE PUBLIC VIEWS
-- ----------------------------------------------------------------------------

-- Remove naive public SELECT policy on the raw public.cats table to prevent
-- malicious clients from querying raw `home_location` via PostgREST / Supabase JS.
DROP POLICY IF EXISTS "Anyone can view missing cat public summaries" ON public.cats;

-- Ensure pet guardians have full private access to their registered cats
DROP POLICY IF EXISTS "Guardians can view full details of their own cats" ON public.cats;
DROP POLICY IF EXISTS "Guardians can view their own cats" ON public.cats;

CREATE POLICY "Guardians can view their own cats"
    ON public.cats FOR SELECT
    USING (auth.uid() = owner_id);

-- Recreate the public masked view with SECURITY BARRIER to prevent optimizer pushdown leaks
CREATE OR REPLACE VIEW public.v_public_missing_cats
WITH (security_barrier = true) AS
SELECT
    c.id,
    c.name,
    c.breed,
    c.gender,
    c.is_neutered,
    c.age_years,
    c.coat_colour,
    c.distinctive_features,
    c.photo_url,
    c.status,
    c.missing_since,
    c.home_address_approx,
    c.emergency_phone,
    -- Strictly expose the 100m-200m jittered coordinates. Exact home_location is NEVER exposed.
    c.home_location_jittered AS location,
    ST_Y(c.home_location_jittered) AS latitude,
    ST_X(c.home_location_jittered) AS longitude
FROM public.cats c
WHERE c.status = 'missing';

COMMENT ON VIEW public.v_public_missing_cats IS
'Public view of actively missing cats. Exposes 100m-200m privacy-shielded coordinates to safeguard pet owners against theft.';

-- Grant read access on the masked view to all client connections
GRANT SELECT ON public.v_public_missing_cats TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. DATA BACKFILL & SYNCHRONIZATION
-- ----------------------------------------------------------------------------

-- Re-compute 100m-200m jittered coordinates for all existing cats with registered locations
UPDATE public.cats
SET home_location_jittered = public.fmc_calculate_jittered_point(home_location, 100.0, 200.0)
WHERE home_location IS NOT NULL;

-- Synchronize existing community alerts linked to cats with the updated jittered location
UPDATE public.community_alerts a
SET location = c.home_location_jittered
FROM public.cats c
WHERE a.cat_id = c.id
  AND a.type = 'missing_alert'
  AND c.home_location_jittered IS NOT NULL;
