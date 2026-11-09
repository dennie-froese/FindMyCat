-- ============================================================================
-- Find My Cat — Storage Bucket, Push Notification Tokens & Sighting Match RPC
-- Migration: 20261109200000_storage_push_and_vaccinations_sync.sql
-- Description:
--   1. Provisions the `fmc-photos` Supabase Storage bucket with MIME-type and
--      5 MB size constraints plus RLS policies for cat passport & sighting photos.
--   2. Adds `expo_push_token` to `public.profiles` and grants self-service
--      insert/update privileges to `authenticated` guardians.
--   3. Upgrades `public.match_sighting_to_missing_cats` to return the guardian's
--      `owner_push_token` alongside `emergency_phone` for instant Push/SMS alerts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SUPABASE STORAGE BUCKET: fmc-photos (Cat Passports & Sighting Reports)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'fmc-photos',
    'fmc-photos',
    true,
    5242880, -- 5 MB max per image
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read access for fmc-photos" ON storage.objects;
CREATE POLICY "Public read access for fmc-photos"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'fmc-photos');

DROP POLICY IF EXISTS "Authenticated and anonymous users can upload to fmc-photos" ON storage.objects;
CREATE POLICY "Authenticated and anonymous users can upload to fmc-photos"
    ON storage.objects
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (bucket_id = 'fmc-photos');

DROP POLICY IF EXISTS "Owners can update their uploaded fmc-photos" ON storage.objects;
CREATE POLICY "Owners can update their uploaded fmc-photos"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'fmc-photos' AND owner = auth.uid())
    WITH CHECK (bucket_id = 'fmc-photos' AND owner = auth.uid());

-- ----------------------------------------------------------------------------
-- 2. PROFILES: EXPO PUSH NOTIFICATION TOKEN
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS expo_push_token TEXT
    CHECK (expo_push_token IS NULL OR char_length(expo_push_token) <= 256);

COMMENT ON COLUMN public.profiles.expo_push_token IS 'Expo Push Notification token (ExponentPushToken[...]) for real-time sighting & radar alerts.';

GRANT INSERT (expo_push_token), UPDATE (expo_push_token) ON public.profiles TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. UPGRADE match_sighting_to_missing_cats WITH GUARDIAN PUSH TOKEN
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.match_sighting_to_missing_cats(uuid, double precision);

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
    owner_push_token TEXT,
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
        p.expo_push_token AS owner_push_token,
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
    LEFT JOIN public.profiles p ON p.id = c.owner_id
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
