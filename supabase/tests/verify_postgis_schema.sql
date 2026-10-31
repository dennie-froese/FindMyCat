-- ============================================================================
-- Find My Cat — PostGIS Schema & Privacy Shield Test & Verification Script
-- File: supabase/tests/verify_postgis_schema.sql
-- Description: End-to-end verification of 100m-200m differential geo-jittering,
--              annular boundary constraints, automatic triggers on cats and
--              community alerts, and masked public view security.
-- ============================================================================

DO $$
DECLARE
    v_orig GEOMETRY;
    v_jittered GEOMETRY;
    v_dist DOUBLE PRECISION;
    v_sighting_id UUID;
    v_profile_id UUID;
    v_cat_id UUID;
    v_alert_id UUID;
    v_alert_loc GEOMETRY;
    v_cat_jittered GEOMETRY;
    v_i INT;
    v_min_observed DOUBLE PRECISION := 999999;
    v_max_observed DOUBLE PRECISION := 0;
BEGIN
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'BEGINNING POSTGIS PRIVACY SHIELD VERIFICATION';
    RAISE NOTICE '==================================================';

    -- Test coordinate: Victoria Park St. Mark's Gate (Longitude -0.0385, Latitude 51.5362)
    v_orig := ST_SetSRID(ST_MakePoint(-0.0385, 51.5362), 4326);

    -- ------------------------------------------------------------------------
    -- TEST 1: Default Parameter Check (100m–200m Bounds & Multi-Iteration Test)
    -- ------------------------------------------------------------------------
    RAISE NOTICE '--- TEST 1: Verifying 100m–200m Annular Jitter Bounds (100 samples) ---';
    FOR v_i IN 1..100 LOOP
        -- Call without explicit radii to test defaults (100.0, 200.0)
        v_jittered := public.fmc_calculate_jittered_point(v_orig);
        v_dist := ST_Distance(v_orig::geography, v_jittered::geography);

        IF v_dist < v_min_observed THEN
            v_min_observed := v_dist;
        END IF;
        IF v_dist > v_max_observed THEN
            v_max_observed := v_dist;
        END IF;

        IF v_dist < 99.5 OR v_dist > 200.5 THEN
            RAISE EXCEPTION 'TEST 1 FAILED on iteration %: Distance %m is outside [100m, 200m]!', v_i, v_dist;
        END IF;
    END LOOP;

    RAISE NOTICE 'Observed Min Offset: % m (>= 100.0m constraint)', ROUND(v_min_observed::numeric, 2);
    RAISE NOTICE 'Observed Max Offset: % m (<= 200.0m constraint)', ROUND(v_max_observed::numeric, 2);
    RAISE NOTICE 'TEST 1 PASSED: All 100 samples strictly conform to [100m, 200m] annular buffer.';

    -- ------------------------------------------------------------------------
    -- TEST 2: Deterministic Seeded Jitter Reproducibility
    -- ------------------------------------------------------------------------
    RAISE NOTICE '--- TEST 2: Verifying Deterministic Seeded Jitter (100m-200m) ---';
    IF NOT ST_Equals(
        public.fmc_calculate_jittered_point_seeded(v_orig, 'mochi_seed'),
        public.fmc_calculate_jittered_point_seeded(v_orig, 'mochi_seed')
    ) THEN
        RAISE EXCEPTION 'TEST 2 FAILED: Deterministic jitter did not produce reproducible points!';
    END IF;

    v_dist := ST_Distance(
        v_orig::geography, 
        public.fmc_calculate_jittered_point_seeded(v_orig, 'mochi_seed')::geography
    );
    IF v_dist < 99.5 OR v_dist > 200.5 THEN
        RAISE EXCEPTION 'TEST 2 FAILED: Seeded distance %m outside [100m, 200m]!', v_dist;
    END IF;
    RAISE NOTICE 'TEST 2 PASSED: Deterministic seeded jitter is reproducible and within bounds (% m).', ROUND(v_dist::numeric, 2);

    -- ------------------------------------------------------------------------
    -- TEST 3: Cats Table Privacy Shield Trigger
    -- ------------------------------------------------------------------------
    RAISE NOTICE '--- TEST 3: Verifying Cats Table Privacy Shield Trigger ---';
    -- Create dummy user in auth.users (handle_new_user automatically creates public.profile)
    v_profile_id := gen_random_uuid();
    INSERT INTO auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    VALUES (
        v_profile_id,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'test_guardian_' || v_profile_id || '@example.com',
        now(),
        now()
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, display_name)
    VALUES (v_profile_id, 'Test Guardian')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.cats (
        owner_id,
        name,
        breed,
        coat_colour,
        status,
        home_location
    ) VALUES (
        v_profile_id,
        'Luna (Bengal)',
        'Bengal',
        'Spotted Rosetted',
        'missing',
        v_orig
    ) RETURNING id, home_location_jittered INTO v_cat_id, v_cat_jittered;

    IF v_cat_jittered IS NULL THEN
        RAISE EXCEPTION 'TEST 3 FAILED: home_location_jittered was not populated by trigger!';
    END IF;

    v_dist := ST_Distance(v_orig::geography, v_cat_jittered::geography);
    IF v_dist < 99.5 OR v_dist > 200.5 THEN
        RAISE EXCEPTION 'TEST 3 FAILED: Cats trigger jitter distance %m is outside [100m, 200m]!', v_dist;
    END IF;
    RAISE NOTICE 'TEST 3 PASSED: Cats trigger auto-populated home_location_jittered (% m offset).', ROUND(v_dist::numeric, 2);

    -- ------------------------------------------------------------------------
    -- TEST 4: Community Alert Broadcast Privacy Shield Sanitization Trigger
    -- ------------------------------------------------------------------------
    RAISE NOTICE '--- TEST 4: Verifying Community Alerts Sanitization Trigger ---';
    -- Attempt to insert an alert with raw residential location (should be overwritten by trigger)
    INSERT INTO public.community_alerts (
        cat_id,
        created_by,
        type,
        title,
        location
    ) VALUES (
        v_cat_id,
        v_profile_id,
        'missing_alert',
        'MISSING BENGAL: Luna',
        v_orig -- Malicious or accidental raw home location passed by client
    ) RETURNING id, location INTO v_alert_id, v_alert_loc;

    -- The alert location MUST match the cat's jittered location, NOT the raw home location
    IF ST_Equals(v_alert_loc, v_orig) THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Alert broadcast location leaked raw home address!';
    END IF;

    IF NOT ST_Equals(v_alert_loc, v_cat_jittered) THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Alert broadcast location (%) does not match cat jittered location (%)!', 
            ST_AsText(v_alert_loc), ST_AsText(v_cat_jittered);
    END IF;
    RAISE NOTICE 'TEST 4 PASSED: Alert broadcast trigger automatically replaced raw address with jittered coordinate.';

    -- ------------------------------------------------------------------------
    -- TEST 5: Public Masked View Verification (v_public_missing_cats)
    -- ------------------------------------------------------------------------
    RAISE NOTICE '--- TEST 5: Verifying Public Masked View (v_public_missing_cats) ---';
    SELECT location INTO v_alert_loc
    FROM public.v_public_missing_cats
    WHERE id = v_cat_id;

    IF v_alert_loc IS NULL OR NOT ST_Equals(v_alert_loc, v_cat_jittered) THEN
        RAISE EXCEPTION 'TEST 5 FAILED: v_public_missing_cats failed to serve valid jittered coordinates!';
    END IF;
    RAISE NOTICE 'TEST 5 PASSED: Public masked view safely serves privacy-shielded coordinates.';

    -- ------------------------------------------------------------------------
    -- TEST 6: Sightings Privacy Shield Trigger
    -- ------------------------------------------------------------------------
    RAISE NOTICE '--- TEST 6: Verifying Sightings Privacy Shield Trigger ---';
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
    IF v_dist IS NULL OR v_dist < 99 OR v_dist > 255 THEN
        RAISE EXCEPTION 'TEST 6 FAILED: Automatic trigger did not populate valid jitter_offset_meters: %', v_dist;
    END IF;
    RAISE NOTICE 'TEST 6 PASSED: Sightings trigger populated jitter offset (% m) on insert.', v_dist;

    -- ------------------------------------------------------------------------
    -- TEST 7: Column-Level Privacy Shield on public.cats (home_location revoked)
    -- ------------------------------------------------------------------------
    RAISE NOTICE '--- TEST 7: Verifying Column-Level SELECT Revocation on public.cats.home_location ---';
    IF has_column_privilege('anon', 'public.cats', 'home_location', 'SELECT') THEN
        RAISE EXCEPTION 'TEST 7 FAILED: anon role still has SELECT privilege on public.cats.home_location!';
    END IF;
    IF has_column_privilege('authenticated', 'public.cats', 'home_location', 'SELECT') THEN
        RAISE EXCEPTION 'TEST 7 FAILED: authenticated role still has SELECT privilege on public.cats.home_location!';
    END IF;
    IF NOT has_column_privilege('anon', 'public.cats', 'home_location_jittered', 'SELECT') THEN
        RAISE EXCEPTION 'TEST 7 FAILED: anon role lacks SELECT on public.cats.home_location_jittered needed by v_public_missing_cats!';
    END IF;
    RAISE NOTICE 'TEST 7 PASSED: Exact home_location is revoked from anon and authenticated; jittered column remains accessible.';

    -- ------------------------------------------------------------------------
    -- TEST 8: Profile Privilege Escalation & Public PII Hardening
    -- ------------------------------------------------------------------------
    RAISE NOTICE '--- TEST 8: Verifying Profile Privilege Escalation Protection ---';
    IF has_table_privilege('anon', 'public.profiles', 'SELECT') THEN
        RAISE EXCEPTION 'TEST 8 FAILED: anon role still has SELECT privilege on public.profiles!';
    END IF;
    IF has_column_privilege('authenticated', 'public.profiles', 'is_verified_caretaker', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.profiles', 'is_guardian_subscriber', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.profiles', 'guardian_tier', 'UPDATE') THEN
        RAISE EXCEPTION 'TEST 8 FAILED: authenticated role can still directly UPDATE privileged billing/caretaker columns on public.profiles!';
    END IF;
    IF has_function_privilege('authenticated', 'public.activate_amber_alert(uuid, uuid, text, numeric)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.activate_amber_alert(uuid, uuid, text, numeric)', 'EXECUTE') THEN
        RAISE EXCEPTION 'TEST 8 FAILED: activate_amber_alert is still executable by anon or authenticated!';
    END IF;
    RAISE NOTICE 'TEST 8 PASSED: Profile PII, privileged role/billing columns, and activate_amber_alert RPC are locked down.';

    -- ------------------------------------------------------------------------
    -- CLEANUP TEST DATA
    -- ------------------------------------------------------------------------
    DELETE FROM public.community_alerts WHERE id = v_alert_id;
    DELETE FROM public.cats WHERE id = v_cat_id;
    DELETE FROM public.profiles WHERE id = v_profile_id;
    DELETE FROM auth.users WHERE id = v_profile_id;
    DELETE FROM public.sightings WHERE id = v_sighting_id;

    RAISE NOTICE '==================================================';
    RAISE NOTICE 'ALL 8 POSTGIS PRIVACY SHIELD & SECURITY TESTS PASSED!';
    RAISE NOTICE '100m-200m Differential Geo-Jittering is 100%% verified.';
    RAISE NOTICE '==================================================';
END;
$$;
