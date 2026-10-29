-- ============================================================================
-- Find My Cat — Community Feedback & Waitlist Leads Schema
-- Migration: 20261029220000_user_feedback_and_waitlist.sql
-- Description: Adds tables and strict zero-exposure Row Level Security (RLS)
--              for private user sentiment feedback and landing page waitlist leads.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. USER FEEDBACK TABLE
-- Captures in-app constructive feedback and ratings (especially <= 3 stars)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_feedback_id TEXT UNIQUE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT NOT NULL DEFAULT '',
    tag TEXT DEFAULT 'General',
    app_version TEXT DEFAULT '1.0.0',
    platform TEXT DEFAULT 'unknown',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.user_feedback IS 'Private feedback submitted through the in-app rating flow.';
COMMENT ON COLUMN public.user_feedback.rating IS 'User rating from 1 to 5 stars.';
COMMENT ON COLUMN public.user_feedback.client_feedback_id IS 'Client-generated unique ID for offline deduplication.';

-- Enable Row-Level Security
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

-- Allow anonymous and authenticated app users to insert feedback
CREATE POLICY "Allow anonymous and authenticated insert to user_feedback"
    ON public.user_feedback
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Revoke public SELECT: Only service_role / internal team may read feedback
CREATE POLICY "Allow service_role full access to user_feedback"
    ON public.user_feedback
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Index for timeline queries
CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at
    ON public.user_feedback (created_at DESC);


-- ----------------------------------------------------------------------------
-- 2. WAITLIST LEADS TABLE
-- Captures pre-launch waitlist registrations from index.html
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.waitlist_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    postcode TEXT DEFAULT '',
    role TEXT DEFAULT 'cat_parent',
    source TEXT NOT NULL DEFAULT 'landing_page',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.waitlist_leads IS 'Pre-launch beta waitlist registrations collected from landing page.';
COMMENT ON COLUMN public.waitlist_leads.email IS 'Contact email of prospective guardian or neighborhood spotter.';

-- Enable Row-Level Security
ALTER TABLE public.waitlist_leads ENABLE ROW LEVEL SECURITY;

-- Allow public users (landing page visitors) to submit waitlist registrations
CREATE POLICY "Allow public insert to waitlist_leads"
    ON public.waitlist_leads
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Prevent public SELECT to safeguard prospective user email addresses
CREATE POLICY "Allow service_role full access to waitlist_leads"
    ON public.waitlist_leads
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Index for email deduplication queries and admin analysis
CREATE INDEX IF NOT EXISTS idx_waitlist_leads_email
    ON public.waitlist_leads (lower(email));

CREATE INDEX IF NOT EXISTS idx_waitlist_leads_created_at
    ON public.waitlist_leads (created_at DESC);
