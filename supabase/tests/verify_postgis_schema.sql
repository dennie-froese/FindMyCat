-- ============================================================================
-- Find My Cat — PostGIS Schema & Privacy Shield Test & Verification Script
-- File: supabase/tests/verify_postgis_schema.sql
-- ============================================================================

DO $$
DECLARE
    v_orig GEOMETRY;
    v_jittered GEOMETRY;
    v_dist DOUBLE PRECISION;
    v_sighting_id UUID;
    v_cat_count INT;
    v_radar_count INT;
BEGIN
    RAISE NOTICE '--- TEST 1: Verifying PostGIS Extensions & Jitter Mathematics ---';
    -- Victoria Park St. Mark's Gate: Longitude -0.0385, Latitude 51.5362
    v_orig := ST_SetSRID(ST_MakePoint(-0.0385, 51.5362), 4326);
    
    -- Apply geo-jittering
    v_jittered := public.fmc_calculate_jittered_point(v_orig, 150.0, 250.0);
    
    -- Measure geodesic distance in meters on WGS84 spheroid
    v_dist := ST_Distance(v_orig::geography, v_jittered::geography);
    
    RAISE NOTICE 'Original Coordinates: (%, %)', ST_X(v_orig), ST_Y(v_orig);
    RAISE NOTICE 'Jittered Coordinates: (%, %)', ST_X(v_jittered), ST_Y(v_jittered);
    RAISE NOTICE 'Calculated Offset: % meters', ROUND(v_dist::numeric, 2);
    
    IF v_dist < 149.0 OR v_dist > 251.0 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Distance %m is outside the [150m, 250m] bounds!', v_dist;
    END IF;
    RAISE NOTICE 'TEST 1 PASSED: Jitter distance is strictly within [150m, 250m] buffer.';

    RAISE NOTICE '--- TEST 2: Verifying Deterministic Seeded Jitter ---';
    IF public.fmc_calculate_jittered_point_seeded(v_orig, 'mochi_seed') <> 
       public.fmc_calculate_jittered_point_seeded(v_orig, 'mochi_seed') THEN
        RAISE EXCEPTION 'TEST 2 FAILED: Deterministic jitter did not produce reproducible points!';
    END IF;
    RAISE NOTICE 'TEST 2 PASSED: Deterministic seeded jitter is 100% reproducible.';

    RAISE NOTICE '--- TEST 3: Verifying Sightings Privacy Shield Trigger ---';
    INSERT INTO public.sightings (
        photo_url,
        notes,
        exact_location
    ) VALUES (
        'https://example.com/test.jpg',
        'Verification test sighting',
        v_orig
    ) RETURNING id INTO v_sighting_id;

    SELECT jitter_offset_meters INTO v_dist FROM public.sightings WHERE id = v_sighting_id;
    IF v_dist IS NULL OR v_dist < 145 OR v_dist > 255 THEN
        RAISE EXCEPTION 'TEST 3 FAILED: Automatic trigger did not populate valid jitter_offset_meters: %', v_dist;
    END IF;
    RAISE NOTICE 'TEST 3 PASSED: Automatic trigger populated jitter offset (% m) on insert.', v_dist;

    -- Cleanup test sighting
    DELETE FROM public.sightings WHERE id = v_sighting_id;

    RAISE NOTICE '==================================================';
    RAISE NOTICE 'ALL FIND MY CAT POSTGIS VERIFICATION TESTS PASSED!';
    RAISE NOTICE '==================================================';
END;
$$;
