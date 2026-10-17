-- ============================================================================
-- Find My Cat — Supabase PostGIS Database Schema
-- Migration: 20261013000000_postgis_schema.sql
-- Description: Core tables, PostGIS spatial indexes, Dual-Zone Privacy Shield
--              geo-jittering functions, Row-Level Security (RLS), and Radar RPCs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ----------------------------------------------------------------------------
-- 2. CUSTOM DOMAINS / CHECKS / HELPER TYPES
-- ----------------------------------------------------------------------------
-- We use standard PostgreSQL check constraints for maximum compatibility with
-- Supabase Studio, PostgREST, and TypeScript type generators.

-- ----------------------------------------------------------------------------
-- 3. PROFILES TABLE (App Users & Cat Guardians)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    display_name TEXT,
    avatar_url TEXT,
    phone_number TEXT,
    neighborhood_name TEXT,
    is_verified_caretaker BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.profiles IS 'User profiles linked directly to Supabase auth.users.';

-- Automatically provision a public.profile whenever a user signs in (including Anonymous Auth)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'display_name', 'Anonymous Finder')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 4. CATS TABLE (Digital Pet Passport & Registered Felines)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    breed TEXT,
    gender TEXT CHECK (gender IN ('Male', 'Female', 'Unknown')) DEFAULT 'Unknown',
    is_neutered BOOLEAN DEFAULT true,
    age_years NUMERIC(3, 1),
    coat_colour TEXT NOT NULL,
    distinctive_features TEXT,
    microchip_number VARCHAR(30) UNIQUE,
    photo_url TEXT,
    status TEXT NOT NULL CHECK (status IN ('safe', 'missing')) DEFAULT 'safe',
    missing_since TIMESTAMPTZ,
    home_address_approx TEXT,
    -- Exact residential coordinates (Strictly Private to the Owner/Guardian)
    home_location GEOMETRY(Point, 4326),
    -- Privacy-shielded coordinates (150m-250m randomized annular jitter for public alerts)
    home_location_jittered GEOMETRY(Point, 4326),
    medical_notes TEXT,
    emergency_phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.cats IS 'Registered cat profiles. home_location is private; home_location_jittered is public.';
COMMENT ON COLUMN public.cats.home_location IS 'Exact residential GPS coordinate (private to guardian).';
COMMENT ON COLUMN public.cats.home_location_jittered IS 'Randomized 150-250m buffer location to safeguard residential privacy.';

-- ----------------------------------------------------------------------------
-- 5. VACCINATION RECORDS TABLE (Pet Passport Health Vault)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vaccination_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cat_id UUID NOT NULL REFERENCES public.cats(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    administered_date DATE NOT NULL,
    next_due_date DATE,
    vet_clinic TEXT,
    batch_number TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.vaccination_records IS 'Vaccination & health history for digital pet passport.';

-- ----------------------------------------------------------------------------
-- 6. SIGHTINGS TABLE (Zero-Friction & Anonymous Spotted Cat Reports)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sightings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Optional link if matched to a known registered cat
    cat_id UUID REFERENCES public.cats(id) ON DELETE SET NULL,
    -- Optional reporter ID (NULL for anonymous passersby)
    reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    -- Ephemeral device token for guest submissions (App Clips / Instant Apps)
    device_token TEXT,
    cat_name_hint TEXT,
    photo_url TEXT NOT NULL,
    coat_colour TEXT,
    collar_description TEXT,
    notes TEXT,
    approximate_location_name TEXT,
    -- True ground-truth GPS position extracted from EXIF or device camera (RESTRICTED ACCESS)
    exact_location GEOMETRY(Point, 4326) NOT NULL,
    -- Privacy-shielded point (150m-250m offset) served to neighborhood map and feed
    jittered_location GEOMETRY(Point, 4326) NOT NULL,
    jitter_offset_meters INTEGER,
    is_anonymous BOOLEAN DEFAULT true,
    status TEXT NOT NULL CHECK (status IN ('unverified', 'investigating', 'confirmed_match', 'resolved')) DEFAULT 'unverified',
    observed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.sightings IS 'Community sighting reports. exact_location is confidential; jittered_location is public.';

-- ----------------------------------------------------------------------------
-- 7. COMMUNITY ALERTS TABLE (Neighborhood Radar & Amber Alerts)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cat_id UUID REFERENCES public.cats(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('missing_alert', 'recent_sighting', 'tnr_colony')),
    title TEXT NOT NULL,
    subtitle TEXT,
    badge_text TEXT,
    photo_url TEXT,
    -- Broadcast point (always privacy-jittered or generalized community zone)
    location GEOMETRY(Point, 4326) NOT NULL,
    -- Default broadcast radar radius in meters (2 miles = ~3218.69 meters)
    broadcast_radius_meters NUMERIC DEFAULT 3218.69,
    status TEXT NOT NULL CHECK (status IN ('critical', 'active', 'safe', 'resolved')) DEFAULT 'active',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.community_alerts IS 'Active neighborhood radar alerts (Amber alerts, sightings, TNR colonies).';

-- ----------------------------------------------------------------------------
-- 8. TNR COLONIES TABLE (Community Cat Caregiver Safe Zones)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tnr_colonies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    caretaker_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cat_count INTEGER DEFAULT 0,
    location GEOMETRY(Point, 4326) NOT NULL,
    is_monitored BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.tnr_colonies IS 'Registered Trap-Neuter-Return community cat colonies and feeding points.';

-- ----------------------------------------------------------------------------
-- 9. SPATIAL INDEXES (GiST) & PERFORMANCE INDEXES
-- ----------------------------------------------------------------------------
-- GiST indexes on geometry(Point, 4326) enable sub-millisecond bounding box (&&)
-- and KNN / ST_DWithin distance queries.

-- Cats spatial & status indexes
CREATE INDEX IF NOT EXISTS idx_cats_home_location
    ON public.cats USING GIST (home_location);

CREATE INDEX IF NOT EXISTS idx_cats_home_location_jittered
    ON public.cats USING GIST (home_location_jittered);

CREATE INDEX IF NOT EXISTS idx_cats_missing_status
    ON public.cats (status)
    WHERE status = 'missing';

CREATE INDEX IF NOT EXISTS idx_cats_owner_id
    ON public.cats (owner_id);

CREATE INDEX IF NOT EXISTS idx_cats_microchip
    ON public.cats (microchip_number)
    WHERE microchip_number IS NOT NULL;

-- Sightings spatial & query indexes
CREATE INDEX IF NOT EXISTS idx_sightings_exact_location
    ON public.sightings USING GIST (exact_location);

CREATE INDEX IF NOT EXISTS idx_sightings_jittered_location
    ON public.sightings USING GIST (jittered_location);

CREATE INDEX IF NOT EXISTS idx_sightings_observed_at_desc
    ON public.sightings (observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_sightings_status
    ON public.sightings (status);

CREATE INDEX IF NOT EXISTS idx_sightings_cat_id
    ON public.sightings (cat_id)
    WHERE cat_id IS NOT NULL;

-- Community Alerts spatial & status indexes
CREATE INDEX IF NOT EXISTS idx_community_alerts_location
    ON public.community_alerts USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_community_alerts_active
    ON public.community_alerts (status, created_at DESC)
    WHERE status IN ('critical', 'active');

-- TNR Colonies spatial index
CREATE INDEX IF NOT EXISTS idx_tnr_colonies_location
    ON public.tnr_colonies USING GIST (location);

-- Vaccination records foreign key index
CREATE INDEX IF NOT EXISTS idx_vaccination_records_cat_id
    ON public.vaccination_records (cat_id);

-- ----------------------------------------------------------------------------
-- 10. DUAL-ZONE PRIVACY SHIELD: GEO-JITTERING FUNCTIONS
-- ----------------------------------------------------------------------------
/**
 * fmc_calculate_jittered_point
 *
 * Implements differential geo-jittering to safeguard residential privacy and
 * prevent targeted pet-theft. Displaces an exact point by a randomized annular
 * distance (default 150m to 250m, averaging 200m) along a uniform random bearing.
 *
 * Mathematical properties:
 * - Uses annular area distribution: r = sqrt(U * (R_max^2 - R_min^2) + R_min^2)
 *   to ensure uniform spatial point density per unit area (avoids center clustering).
 * - Azimuth theta is sampled uniformly in [0, 2*pi).
 * - Uses PostGIS ST_Project(geography, distance, azimuth) for geodesic accuracy
 *   on the WGS84 spheroid (accurate across all global latitudes).
 * - Snaps coordinates to 6 decimal places (~0.1m) to eliminate precision fingerprinting.
 */
CREATE OR REPLACE FUNCTION public.fmc_calculate_jittered_point(
    input_point GEOMETRY,
    min_radius_meters DOUBLE PRECISION DEFAULT 150.0,
    max_radius_meters DOUBLE PRECISION DEFAULT 250.0
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

    -- Ensure valid radii
    IF min_radius_meters < 0 OR max_radius_meters < min_radius_meters THEN
        RAISE EXCEPTION 'Invalid jitter parameters: min_radius must be >= 0 and <= max_radius';
    END IF;

    -- Sample uniform random variables
    u := random();
    v := random();

    -- Uniform areal distribution within the annulus [min_radius, max_radius]
    dist_meters := sqrt(u * (max_radius_meters^2 - min_radius_meters^2) + min_radius_meters^2);

    -- Uniform random bearing in radians [0, 2*pi)
    bearing_rad := v * 2.0 * pi();

    -- PostGIS ST_Project operates on geography (WGS84 spheroid)
    -- ST_Project(geog, distance_meters, azimuth_radians)
    projected_geog := ST_Project(input_point::geography, dist_meters, bearing_rad);

    -- Convert back to geometry(Point, 4326) and round to 6 decimal places
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

COMMENT ON FUNCTION public.fmc_calculate_jittered_point IS 'Applies randomized annular 150m-250m geodesic jittering to protect residential privacy.';

/**
 * fmc_calculate_jittered_point_seeded
 *
 * Deterministic pseudo-random version of the privacy jitter function.
 * Generates a stable, reproducible jitter for testing, auditing, or caching,
 * derived from the MD5 hash of an input seed (e.g. record UUID or secret salt).
 */
CREATE OR REPLACE FUNCTION public.fmc_calculate_jittered_point_seeded(
    input_point GEOMETRY,
    seed_text TEXT,
    min_radius_meters DOUBLE PRECISION DEFAULT 150.0,
    max_radius_meters DOUBLE PRECISION DEFAULT 250.0
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

    -- Derive two pseudo-random floats in [0, 1) from MD5 hash chunks
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

COMMENT ON FUNCTION public.fmc_calculate_jittered_point_seeded IS 'Deterministic pseudo-random geo-jittering function for reproducible testing & auditing.';

-- ----------------------------------------------------------------------------
-- 11. AUTOMATIC TRIGGERS (Privacy Shield & Updated At Timestamps)
-- ----------------------------------------------------------------------------

-- Universal updated_at trigger function
CREATE OR REPLACE FUNCTION public.fmc_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$;

-- Sightings privacy shield trigger: automatically populates jittered_location & offset
CREATE OR REPLACE FUNCTION public.fmc_trg_sightings_privacy_shield()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.exact_location IS NOT NULL THEN
        -- Recompute jittered location if not explicitly provided or if exact_location has moved
        IF TG_OP = 'INSERT' OR (NEW.exact_location IS DISTINCT FROM OLD.exact_location) OR NEW.jittered_location IS NULL THEN
            NEW.jittered_location := public.fmc_calculate_jittered_point(NEW.exact_location, 150.0, 250.0);
            NEW.jitter_offset_meters := round(ST_Distance(NEW.exact_location::geography, NEW.jittered_location::geography))::integer;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sightings_privacy_shield ON public.sightings;
CREATE TRIGGER trg_sightings_privacy_shield
    BEFORE INSERT OR UPDATE OF exact_location
    ON public.sightings
    FOR EACH ROW
    EXECUTE FUNCTION public.fmc_trg_sightings_privacy_shield();

-- Cats home address privacy shield trigger
CREATE OR REPLACE FUNCTION public.fmc_trg_cats_privacy_shield()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.home_location IS NOT NULL THEN
        IF TG_OP = 'INSERT' OR (NEW.home_location IS DISTINCT FROM OLD.home_location) OR NEW.home_location_jittered IS NULL THEN
            NEW.home_location_jittered := public.fmc_calculate_jittered_point(NEW.home_location, 150.0, 250.0);
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

-- Wire updated_at triggers
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.fmc_set_updated_at();

DROP TRIGGER IF EXISTS trg_cats_updated_at ON public.cats;
CREATE TRIGGER trg_cats_updated_at
    BEFORE UPDATE ON public.cats
    FOR EACH ROW EXECUTE FUNCTION public.fmc_set_updated_at();

DROP TRIGGER IF EXISTS trg_vaccinations_updated_at ON public.vaccination_records;
CREATE TRIGGER trg_vaccinations_updated_at
    BEFORE UPDATE ON public.vaccination_records
    FOR EACH ROW EXECUTE FUNCTION public.fmc_set_updated_at();

DROP TRIGGER IF EXISTS trg_sightings_updated_at ON public.sightings;
CREATE TRIGGER trg_sightings_updated_at
    BEFORE UPDATE ON public.sightings
    FOR EACH ROW EXECUTE FUNCTION public.fmc_set_updated_at();

DROP TRIGGER IF EXISTS trg_community_alerts_updated_at ON public.community_alerts;
CREATE TRIGGER trg_community_alerts_updated_at
    BEFORE UPDATE ON public.community_alerts
    FOR EACH ROW EXECUTE FUNCTION public.fmc_set_updated_at();

DROP TRIGGER IF EXISTS trg_tnr_colonies_updated_at ON public.tnr_colonies;
CREATE TRIGGER trg_tnr_colonies_updated_at
    BEFORE UPDATE ON public.tnr_colonies
    FOR EACH ROW EXECUTE FUNCTION public.fmc_set_updated_at();

-- ----------------------------------------------------------------------------
-- 12. PUBLIC MASKED VIEWS (Zero Leakage of Confidential GPS)
-- ----------------------------------------------------------------------------

-- Public Sightings View: Exposes ONLY the jittered_location to clients and maps
CREATE OR REPLACE VIEW public.v_public_sightings AS
SELECT
    s.id,
    s.cat_id,
    s.cat_name_hint,
    s.photo_url,
    s.coat_colour,
    s.collar_description,
    s.notes,
    s.approximate_location_name,
    s.is_anonymous,
    s.status,
    s.observed_at,
    s.created_at,
    -- Public coordinates derived exclusively from jittered_location
    s.jittered_location AS location,
    ST_Y(s.jittered_location) AS latitude,
    ST_X(s.jittered_location) AS longitude
FROM public.sightings s;

COMMENT ON VIEW public.v_public_sightings IS 'Public feed view for sightings. Strictly masks exact_location.';

-- Public Missing Cats View: Exposes jittered home coordinates for public search
CREATE OR REPLACE VIEW public.v_public_missing_cats AS
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
    -- Expose ONLY jittered home coordinates
    c.home_location_jittered AS location,
    ST_Y(c.home_location_jittered) AS latitude,
    ST_X(c.home_location_jittered) AS longitude
FROM public.cats c
WHERE c.status = 'missing';

COMMENT ON VIEW public.v_public_missing_cats IS 'Public view of actively missing cats with privacy-buffered home locations.';

-- ----------------------------------------------------------------------------
-- 13. HIGH-PERFORMANCE POSTGIS RPC FUNCTIONS (Supabase Client Endpoints)
-- ----------------------------------------------------------------------------

/**
 * get_nearby_sightings
 *
 * Efficient spatial query returning sightings within a user-specified radius.
 * Leverages the GiST index on jittered_location via ST_DWithin.
 * Returns human-readable distance in miles for the mobile radar and feed.
 */
CREATE OR REPLACE FUNCTION public.get_nearby_sightings(
    user_longitude DOUBLE PRECISION,
    user_latitude DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION DEFAULT 3218.69, -- 2 miles
    max_results INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    cat_id UUID,
    cat_name_hint TEXT,
    photo_url TEXT,
    coat_colour TEXT,
    collar_description TEXT,
    notes TEXT,
    approximate_location_name TEXT,
    status TEXT,
    observed_at TIMESTAMPTZ,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION,
    distance_miles DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    center_point GEOGRAPHY;
BEGIN
    center_point := ST_SetSRID(ST_MakePoint(user_longitude, user_latitude), 4326)::geography;

    RETURN QUERY
    SELECT
        s.id,
        s.cat_id,
        s.cat_name_hint,
        s.photo_url,
        s.coat_colour,
        s.collar_description,
        s.notes,
        s.approximate_location_name,
        s.status,
        s.observed_at,
        ST_Y(s.jittered_location) AS latitude,
        ST_X(s.jittered_location) AS longitude,
        ROUND(ST_Distance(s.jittered_location::geography, center_point)::numeric, 1)::double precision AS distance_meters,
        ROUND((ST_Distance(s.jittered_location::geography, center_point) / 1609.344)::numeric, 2)::double precision AS distance_miles
    FROM public.sightings s
    WHERE ST_DWithin(s.jittered_location::geography, center_point, radius_meters)
    ORDER BY s.observed_at DESC
    LIMIT max_results;
END;
$$;

COMMENT ON FUNCTION public.get_nearby_sightings IS 'Fast PostGIS proximity search for sightings within radius_meters.';

/**
 * get_community_radar
 *
 * Powers the unified Neighborhood Radar Screen and hero scanner component.
 * Combines active amber alerts, recent sightings (<48 hours), and TNR colonies
 * into a single unified stream of radar blips ordered by proximity.
 */
CREATE OR REPLACE FUNCTION public.get_community_radar(
    user_longitude DOUBLE PRECISION,
    user_latitude DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION DEFAULT 3218.69 -- 2 miles
)
RETURNS TABLE (
    id UUID,
    blip_type TEXT, -- 'missing_alert' | 'recent_sighting' | 'tnr_colony'
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
AS $$
DECLARE
    center_point GEOGRAPHY;
BEGIN
    center_point := ST_SetSRID(ST_MakePoint(user_longitude, user_latitude), 4326)::geography;

    RETURN QUERY
    -- 1. Active Amber / Missing Alerts
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
      AND ST_DWithin(a.location::geography, center_point, radius_meters)

    UNION ALL

    -- 2. Recent Sightings (within last 48 hours)
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

    -- 3. TNR Community Cat Colonies
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

COMMENT ON FUNCTION public.get_community_radar IS 'Aggregates missing alerts, recent sightings, and TNR colonies into neighborhood radar blips.';

/**
 * match_sighting_to_missing_cats
 *
 * When a sighting is reported, finds registered missing cats whose home/last-seen
 * location is within a reasonable feline wandering radius (default 1500m / 1 mile).
 */
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
        ROUND(ST_Distance(c.home_location::geography, target_location::geography)::numeric, 1)::double precision AS distance_meters
    FROM public.cats c
    WHERE c.status = 'missing'
      AND c.home_location IS NOT NULL
      AND ST_DWithin(c.home_location::geography, target_location::geography, search_radius_meters)
    ORDER BY distance_meters ASC;
END;
$$;

COMMENT ON FUNCTION public.match_sighting_to_missing_cats IS 'Finds missing cats registered within wandering radius of a sighting location.';

-- ----------------------------------------------------------------------------
-- 14. ROW-LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vaccination_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sightings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tnr_colonies ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone"
    ON public.profiles FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Cats Policies
DROP POLICY IF EXISTS "Guardians can view full details of their own cats" ON public.cats;
CREATE POLICY "Guardians can view full details of their own cats"
    ON public.cats FOR SELECT
    USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Anyone can view missing cat public summaries" ON public.cats;
CREATE POLICY "Anyone can view missing cat public summaries"
    ON public.cats FOR SELECT
    USING (status = 'missing');

DROP POLICY IF EXISTS "Guardians can insert cats" ON public.cats;
CREATE POLICY "Guardians can insert cats"
    ON public.cats FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Guardians can update their cats" ON public.cats;
CREATE POLICY "Guardians can update their cats"
    ON public.cats FOR UPDATE
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Guardians can delete their cats" ON public.cats;
CREATE POLICY "Guardians can delete their cats"
    ON public.cats FOR DELETE
    USING (auth.uid() = owner_id);

-- Vaccination Records Policies (Restricted to Pet Owner)
DROP POLICY IF EXISTS "Guardians can view their cats vaccination records" ON public.vaccination_records;
CREATE POLICY "Guardians can view their cats vaccination records"
    ON public.vaccination_records FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.cats
        WHERE cats.id = vaccination_records.cat_id
          AND cats.owner_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Guardians can manage vaccination records" ON public.vaccination_records;
CREATE POLICY "Guardians can manage vaccination records"
    ON public.vaccination_records FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.cats
        WHERE cats.id = vaccination_records.cat_id
          AND cats.owner_id = auth.uid()
    ));

-- Sightings Policies
-- Authenticated sessions (including Supabase Anonymous Auth) can insert sightings
DROP POLICY IF EXISTS "Users can submit sightings with their auth identity" ON public.sightings;
CREATE POLICY "Users can submit sightings with their auth identity"
    ON public.sightings FOR INSERT
    WITH CHECK (
        auth.uid() = reporter_id
        OR reporter_id IS NULL
    );

-- Reporters can view sightings they submitted (via auth identity or fallback token)
DROP POLICY IF EXISTS "Reporters can view their submitted sightings" ON public.sightings;
CREATE POLICY "Reporters can view their submitted sightings"
    ON public.sightings FOR SELECT
    USING (
        auth.uid() = reporter_id
        OR (reporter_id IS NULL AND device_token IS NOT NULL)
    );

-- Cat guardians can view exact sightings of their own cat
DROP POLICY IF EXISTS "Cat guardians can view sightings matching their cat" ON public.sightings;
CREATE POLICY "Cat guardians can view sightings matching their cat"
    ON public.sightings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.cats
            WHERE cats.id = sightings.cat_id
              AND cats.owner_id = auth.uid()
        )
    );

-- Verified community caretakers can view unverified sightings for investigation
DROP POLICY IF EXISTS "Verified caretakers can view sightings" ON public.sightings;
CREATE POLICY "Verified caretakers can view sightings"
    ON public.sightings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.is_verified_caretaker = true
        )
    );

-- Community Alerts Policies
DROP POLICY IF EXISTS "Community alerts are publicly readable" ON public.community_alerts;
CREATE POLICY "Community alerts are publicly readable"
    ON public.community_alerts FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Authenticated users can create alerts for their cats" ON public.community_alerts;
CREATE POLICY "Authenticated users can create alerts for their cats"
    ON public.community_alerts FOR INSERT
    WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Alert creators can update their alerts" ON public.community_alerts;
CREATE POLICY "Alert creators can update their alerts"
    ON public.community_alerts FOR UPDATE
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

-- TNR Colonies Policies
DROP POLICY IF EXISTS "TNR colonies are publicly readable" ON public.tnr_colonies;
CREATE POLICY "TNR colonies are publicly readable"
    ON public.tnr_colonies FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Verified caretakers can manage TNR colonies" ON public.tnr_colonies;
CREATE POLICY "Verified caretakers can manage TNR colonies"
    ON public.tnr_colonies FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.is_verified_caretaker = true
        )
    );
