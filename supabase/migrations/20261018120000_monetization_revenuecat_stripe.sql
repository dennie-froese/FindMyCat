-- ============================================================================
-- Find My Cat — Monetization & In-App Purchases Schema
-- Migration: 20261018120000_monetization_revenuecat_stripe.sql
-- Description: Adds subscription entitlement tracking (RevenueCat StoreKit 2 /
--              Google Play Billing) and one-off transactional order records
--              (Stripe Amber Alerts: £14.99).
-- ============================================================================

-- 1. Extend PROFILES with Cat Guardian Subscription Entitlements
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS guardian_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (guardian_tier IN ('free', 'guardian_monthly', 'guardian_annual', 'lifetime')),
ADD COLUMN IF NOT EXISTS is_guardian_subscriber BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS guardian_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS revenuecat_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

COMMENT ON COLUMN public.profiles.guardian_tier IS 'Subscription tier: free or guardian (£2.99/mo).';
COMMENT ON COLUMN public.profiles.is_guardian_subscriber IS 'Boolean flag for active Cat Guardian entitlement.';
COMMENT ON COLUMN public.profiles.revenuecat_customer_id IS 'Associated RevenueCat App User ID.';

-- 2. CREATE PAYMENT TRANSACTIONS TABLE
-- Stores RevenueCat subscription events and Stripe Amber Alert broadcasts
CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cat_id UUID REFERENCES public.cats(id) ON DELETE SET NULL,
    
    -- Digital Product catalog definition
    product_type TEXT NOT NULL CHECK (
        product_type IN (
            'cat_guardian_monthly',  -- RevenueCat: £2.99/mo
            'cat_guardian_annual',   -- RevenueCat: £29.99/yr
            'amber_alert_broadcast'  -- Stripe: £14.99 one-off
        )
    ),
    provider TEXT NOT NULL CHECK (provider IN ('revenuecat', 'stripe')),
    
    -- Money handling (stored in pence to avoid floating point issues)
    amount_pence INTEGER NOT NULL CHECK (amount_pence >= 0),
    currency TEXT NOT NULL DEFAULT 'gbp',
    
    -- Provider reference IDs
    stripe_payment_intent_id TEXT,
    stripe_checkout_session_id TEXT,
    revenuecat_transaction_id TEXT,
    
    -- Status
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'cancelled')
    ) DEFAULT 'pending',
    
    -- Extra diagnostic or alert metadata (e.g. radius, notification count)
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user ON public.payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_cat ON public.payment_transactions(cat_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_stripe_pi ON public.payment_transactions(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON public.payment_transactions(status);

COMMENT ON TABLE public.payment_transactions IS 'Tracks RevenueCat subscription records and Stripe one-off transactions.';

-- 3. FUNCTION TO ACTIVATE AMBER ALERT UPON SUCCESSFUL STRIPE CHECKOUT (£14.99)
CREATE OR REPLACE FUNCTION public.activate_amber_alert(
    p_cat_id UUID,
    p_user_id UUID,
    p_payment_intent_id TEXT,
    p_broadcast_radius_meters NUMERIC DEFAULT 3218.69 -- 2 miles
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cat RECORD;
    v_alert_id UUID;
    v_jittered_loc GEOMETRY(Point, 4326);
BEGIN
    -- Fetch the cat details
    SELECT * INTO v_cat FROM public.cats WHERE id = p_cat_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cat with ID % not found', p_cat_id;
    END IF;

    -- Update cat status to missing
    UPDATE public.cats
    SET status = 'missing',
        missing_since = COALESCE(missing_since, timezone('utc', now())),
        updated_at = timezone('utc', now())
    WHERE id = p_cat_id;

    -- Compute privacy-shielded center for community broadcast
    IF v_cat.home_location IS NOT NULL THEN
        -- Use privacy shield jitter around home location
        v_jittered_loc := ST_SetSRID(
            ST_MakePoint(
                ST_X(v_cat.home_location) + (random() * 0.003 - 0.0015),
                ST_Y(v_cat.home_location) + (random() * 0.003 - 0.0015)
            ),
            4326
        );
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
        p_user_id,
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

-- 4. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own payment transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON public.payment_transactions;
CREATE POLICY "Users can view own transactions"
    ON public.payment_transactions
    FOR SELECT
    USING (auth.uid() = user_id);

-- Only authenticated users or service role can insert pending transactions
DROP POLICY IF EXISTS "Users can insert own pending transactions" ON public.payment_transactions;
CREATE POLICY "Users can insert own pending transactions"
    ON public.payment_transactions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
