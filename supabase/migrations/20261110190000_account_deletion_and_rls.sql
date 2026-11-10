-- ============================================================================
-- Find My Cat — In-App Account Deletion & Self-Service Erasure RLS
-- Migration: 20261110190000_account_deletion_and_rls.sql
-- Description:
--   1. Adds self-service DELETE policies and table privileges for `profiles`,
--      `sightings`, `community_alerts`, and `storage.objects` (`fmc-photos`).
--   2. Creates `public.delete_my_account()` SECURITY DEFINER RPC so an
--      authenticated (or anonymous-authenticated) user can permanently erase
--      their uploaded photos, sightings, alerts, cats, profile, and auth.users
--      record in a single atomic call (Apple App Store Guideline 5.1.1(v)).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SELF-SERVICE DELETE RLS POLICIES & GRANTS
-- ----------------------------------------------------------------------------
GRANT DELETE ON public.profiles TO authenticated;
GRANT DELETE ON public.cats TO authenticated;
GRANT DELETE ON public.vaccination_records TO authenticated;
GRANT DELETE ON public.sightings TO authenticated;
GRANT DELETE ON public.community_alerts TO authenticated;

DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
CREATE POLICY "Users can delete their own profile"
    ON public.profiles
    FOR DELETE
    TO authenticated
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Reporters can delete their submitted sightings" ON public.sightings;
CREATE POLICY "Reporters can delete their submitted sightings"
    ON public.sightings
    FOR DELETE
    TO authenticated
    USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Alert creators can delete their alerts" ON public.community_alerts;
CREATE POLICY "Alert creators can delete their alerts"
    ON public.community_alerts
    FOR DELETE
    TO authenticated
    USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Owners can delete their uploaded fmc-photos" ON storage.objects;
CREATE POLICY "Owners can delete their uploaded fmc-photos"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = 'fmc-photos' AND owner = auth.uid());

-- ----------------------------------------------------------------------------
-- 2. ATOMIC ACCOUNT ERASURE RPC: public.delete_my_account()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, auth, extensions
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_deleted_cats INTEGER := 0;
    v_deleted_sightings INTEGER := 0;
    v_deleted_photos INTEGER := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 1. Delete user-owned objects in fmc-photos storage bucket
    DELETE FROM storage.objects
    WHERE bucket_id = 'fmc-photos'
      AND owner = v_user_id;
    GET DIAGNOSTICS v_deleted_photos = ROW_COUNT;

    -- 2. Delete community alerts created by the user
    DELETE FROM public.community_alerts
    WHERE created_by = v_user_id;

    -- 3. Delete sightings reported by the user
    DELETE FROM public.sightings
    WHERE reporter_id = v_user_id;
    GET DIAGNOSTICS v_deleted_sightings = ROW_COUNT;

    -- 4. Delete cats owned by the user (cascades to vaccination_records & cat alerts)
    DELETE FROM public.cats
    WHERE owner_id = v_user_id;
    GET DIAGNOSTICS v_deleted_cats = ROW_COUNT;

    -- 5. Delete profile row
    DELETE FROM public.profiles
    WHERE id = v_user_id;

    -- 6. Delete auth.users identity record
    DELETE FROM auth.users
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'deletedUserId', v_user_id,
        'deletedCats', v_deleted_cats,
        'deletedSightings', v_deleted_sightings,
        'deletedPhotos', v_deleted_photos
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated, service_role;
