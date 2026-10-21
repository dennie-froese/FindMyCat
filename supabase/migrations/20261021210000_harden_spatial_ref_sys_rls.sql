-- ============================================================================
-- Find My Cat — PostGIS Spatial Reference System Access Revocation
-- Migration: 20261021210000_harden_spatial_ref_sys_rls.sql
-- Description: Revokes all permissions on PostGIS's public.spatial_ref_sys
--              from anon and authenticated roles. This prevents PostgREST from
--              exposing spatial_ref_sys to the public API while avoiding the
--              PostgreSQL 42501 ownership error (spatial_ref_sys is owned by supabase_admin).
-- ============================================================================

REVOKE ALL ON TABLE public.spatial_ref_sys FROM anon, authenticated;
