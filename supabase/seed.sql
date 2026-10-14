-- ============================================================================
-- Find My Cat — Supabase Seed Data (Victoria Park / London Demo Dataset)
-- File: supabase/seed.sql
-- ============================================================================

-- 1. Create Demo Users in auth.users (Required for foreign key constraints)
INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token
)
VALUES
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'sarah.jenkins@example.com',
        crypt('demoPassword123!', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}',
        '{"display_name":"Sarah J.","full_name":"Sarah Jenkins"}',
        now(),
        now(),
        '',
        ''
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'liam.davies@example.com',
        crypt('demoPassword123!', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}',
        '{"display_name":"Liam D.","full_name":"Liam Davies"}',
        now(),
        now(),
        '',
        ''
    )
ON CONFLICT (id) DO NOTHING;

-- 2. Populate / Update Demo User Profiles
INSERT INTO public.profiles (id, full_name, display_name, phone_number, neighborhood_name, is_verified_caretaker)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'Sarah Jenkins', 'Sarah J.', '+44 7700 900123', 'Victoria Park / Hackney', true),
    ('00000000-0000-0000-0000-000000000002', 'Liam Davies', 'Liam D.', '+44 7700 900456', 'Bow & Mile End', false)
ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    display_name = EXCLUDED.display_name,
    phone_number = EXCLUDED.phone_number,
    neighborhood_name = EXCLUDED.neighborhood_name,
    is_verified_caretaker = EXCLUDED.is_verified_caretaker;

-- 3. Create Registered Cats
INSERT INTO public.cats (
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
    emergency_phone,
    home_address_approx,
    home_location
)
VALUES
    (
        '11111111-1111-1111-1111-111111111111',
        '00000000-0000-0000-0000-000000000001',
        'Mochi',
        'British Shorthair / Ginger Tabby',
        'Male',
        true,
        3.0,
        'Warm Ginger with White Bib & Paws',
        'Small nick on left ear tip, green eyes, distinct white chest patch',
        '985141002345678',
        'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&auto=format&fit=crop&q=80',
        'safe',
        '+44 7700 900123',
        'Near Victoria Park / St. Mark’s Gate',
        ST_SetSRID(ST_MakePoint(-0.0385, 51.5362), 4326) -- Note: Longitude, Latitude
    ),
    (
        '22222222-2222-2222-2222-222222222222',
        '00000000-0000-0000-0000-000000000002',
        'Oliver',
        'Domestic Shorthair (Tuxedo)',
        'Male',
        true,
        4.5,
        'Black & White Tuxedo',
        'Symmetrical white blaze on muzzle, 4 white socks',
        '985141009876543',
        'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=600&auto=format&fit=crop&q=80',
        'missing',
        '+44 7700 900456',
        'Near Lauriston Road Village',
        ST_SetSRID(ST_MakePoint(-0.0370, 51.5380), 4326)
    )
ON CONFLICT (id) DO NOTHING;

-- 4. Vaccination Records for Pet Passport
INSERT INTO public.vaccination_records (cat_id, name, administered_date, next_due_date, vet_clinic)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'Cat Flu & Enteritis (Core Booster)', '2026-03-15', '2027-03-15', 'Victoria Park Vets'),
    ('11111111-1111-1111-1111-111111111111', 'FeLV (Feline Leukaemia Vaccine)', '2025-09-10', '2026-09-10', 'Victoria Park Vets'),
    ('11111111-1111-1111-1111-111111111111', 'Annual Microchip Check & Health Screen', '2026-03-15', '2027-03-15', 'Victoria Park Vets')
ON CONFLICT DO NOTHING;

-- 5. Sightings (The trigger trg_sightings_privacy_shield automatically generates jittered_location!)
INSERT INTO public.sightings (
    id,
    cat_id,
    reporter_id,
    cat_name_hint,
    photo_url,
    approximate_location_name,
    notes,
    coat_colour,
    collar_description,
    is_anonymous,
    status,
    observed_at,
    exact_location
)
VALUES
    (
        '33333333-3333-3333-3333-333333333331',
        '11111111-1111-1111-1111-111111111111',
        '00000000-0000-0000-0000-000000000001',
        'Looks like Mochi',
        'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=600&auto=format&fit=crop&q=80',
        'Behind Pavilion Cafe, hedge line',
        'Resting quietly under shrubbery. Unharmed, wearing blue breakaway collar.',
        'Ginger Tabby',
        'Blue collar with reflective bell',
        true,
        'investigating',
        timezone('utc', now()) - INTERVAL '2 hours',
        ST_SetSRID(ST_MakePoint(-0.0392, 51.5375), 4326)
    ),
    (
        '33333333-3333-3333-3333-333333333332',
        NULL,
        '00000000-0000-0000-0000-000000000002',
        'Calico shorthair',
        'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&auto=format&fit=crop&q=80',
        'Gore Road residential alleyway',
        'Calico domestic shorthair observed near garden fence.',
        'Calico / Tortie & White',
        NULL,
        true,
        'unverified',
        timezone('utc', now()) - INTERVAL '14 hours',
        ST_SetSRID(ST_MakePoint(-0.0351, 51.5342), 4326)
    )
ON CONFLICT (id) DO NOTHING;

-- 6. Community Alerts (Amber Alerts & Sightings)
INSERT INTO public.community_alerts (
    id,
    cat_id,
    created_by,
    type,
    title,
    subtitle,
    badge_text,
    photo_url,
    status,
    location
)
VALUES
    (
        '44444444-4444-4444-4444-444444444441',
        '22222222-2222-2222-2222-222222222222',
        '00000000-0000-0000-0000-000000000002',
        'missing_alert',
        'Missing: Oliver (Tuxedo)',
        'Escaped 48h ago near Lauriston Rd. Very skittish.',
        'URGENT ALERT',
        'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=600&auto=format&fit=crop&q=80',
        'critical',
        public.fmc_calculate_jittered_point(ST_SetSRID(ST_MakePoint(-0.0370, 51.5380), 4326))
    )
ON CONFLICT (id) DO NOTHING;

-- 7. TNR Community Cat Colonies
INSERT INTO public.tnr_colonies (
    id,
    name,
    description,
    caretaker_id,
    cat_count,
    location,
    is_monitored
)
VALUES
    (
        '55555555-5555-5555-5555-555555555551',
        'Canal Basin Caregiver Colony',
        '4 registered ear-tipped community cats under daily care.',
        '00000000-0000-0000-0000-000000000001',
        4,
        ST_SetSRID(ST_MakePoint(-0.0420, 51.5320), 4326),
        true
    )
ON CONFLICT (id) DO NOTHING;
