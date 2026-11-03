/**
 * Find My Cat — Sighting Submission & Cloud Sync Service
 * Implements Option A + Option B Architecture:
 * - Option A: Supabase Native Anonymous Sign-In (Zero signup friction, real auth.uid())
 * - Option B: Edge Function Gateway with Cloudflare Turnstile Verification (100% Free Anti-Abuse)
 */

import type { CatProfile, SightingReport } from '../types/index.ts';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generates an RFC-4122 v4 UUID for cat passports and sighting IDs so mobile
 * records and QR code links map directly to PostgreSQL UUID primary keys.
 */
export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns the string if it is a valid UUID, or null otherwise.
 */
export function toValidUuid(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  return UUID_REGEX.test(trimmed) ? trimmed : null;
}

/**
 * Returns true when live Supabase credentials are configured and we are not inside
 * an isolated unit test runner.
 */
export function isCloudSyncConfigured(): boolean {
  if (typeof process !== 'undefined' && process.env?.NODE_TEST_CONTEXT) {
    return false;
  }
  return Boolean(
    SUPABASE_URL &&
      SUPABASE_ANON_KEY &&
      !SUPABASE_URL.includes('your-project') &&
      !SUPABASE_ANON_KEY.includes('your-anon-key')
  );
}

/**
 * Ensures the device has an active Supabase session.
 * If the user has not logged in, automatically issues an Anonymous Session (Option A).
 */
export async function ensureActiveSession(supabaseClient: any): Promise<string> {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (sessionData?.session?.access_token) {
    return sessionData.session.access_token;
  }

  // Issue zero-friction anonymous JWT
  const { data: authData, error } = await supabaseClient.auth.signInAnonymously();
  if (error || !authData?.session) {
    throw new Error(`Failed to establish anonymous session: ${error?.message}`);
  }

  return authData.session.access_token;
}

/**
 * Ensures an active session and returns both the access token and user ID.
 */
export async function ensureAuthenticatedUser(
  supabaseClient: any
): Promise<{ accessToken: string; userId: string }> {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (sessionData?.session?.access_token && sessionData?.session?.user?.id) {
    return {
      accessToken: sessionData.session.access_token,
      userId: sessionData.session.user.id,
    };
  }

  const { data: authData, error } = await supabaseClient.auth.signInAnonymously();
  if (error || !authData?.session?.user?.id) {
    throw new Error(`Failed to establish anonymous session: ${error?.message}`);
  }

  return {
    accessToken: authData.session.access_token,
    userId: authData.session.user.id,
  };
}

export interface SubmitSightingParams {
  photoUri: string;
  latitude: number;
  longitude: number;
  catId?: string;
  catNameHint?: string;
  coatColour?: string;
  collarDescription?: string;
  notes?: string;
  approximateLocationName?: string;
  turnstileToken?: string; // Generated via invisible Cloudflare Turnstile widget
}

/**
 * Submits a new sighting report through the Supabase Edge Function (Option B Gateway),
 * with automatic fallback to direct PostGIS insert if the Edge Function is not deployed.
 */
export async function submitSightingWithProtection(
  supabaseClient: any,
  params: SubmitSightingParams
): Promise<{ success: boolean; sightingId: string; offsetMeters: number }> {
  // 1. Ensure user is signed in (anonymously or permanently)
  const { accessToken, userId } = await ensureAuthenticatedUser(supabaseClient);
  const validCatId = toValidUuid(params.catId);

  // 2. Call the Edge Function Gateway when a live Supabase URL is configured
  if (isCloudSyncConfigured()) {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/report-sighting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          catId: validCatId,
          catNameHint: params.catNameHint,
          photoUrl: params.photoUri,
          coatColour: params.coatColour,
          collarDescription: params.collarDescription,
          notes: params.notes,
          approximateLocationName: params.approximateLocationName,
          latitude: params.latitude,
          longitude: params.longitude,
          turnstileToken: params.turnstileToken,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return {
          success: true,
          sightingId: result.sighting.id,
          offsetMeters: result.privacyShield?.offsetMeters || 200,
        };
      }
    } catch (edgeErr) {
      console.warn('[sightingService] Edge Function unreachable, falling back to direct PostGIS insert:', edgeErr);
    }
  }

  // 3. Resilient fallback: direct insert into `public.sightings` (triggers trg_sightings_privacy_shield)
  const { data: inserted, error: insertError } = await supabaseClient
    .from('sightings')
    .insert({
      reporter_id: userId,
      cat_id: validCatId,
      cat_name_hint: params.catNameHint ?? null,
      photo_url: params.photoUri,
      coat_colour: params.coatColour ?? null,
      collar_description: params.collarDescription ?? null,
      notes: params.notes ?? null,
      approximate_location_name: params.approximateLocationName ?? 'Spotted locally',
      exact_location: `SRID=4326;POINT(${params.longitude} ${params.latitude})`,
      is_anonymous: true,
      status: 'unverified',
    })
    .select('id, jitter_offset_meters')
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message || 'Failed to submit sighting to Supabase');
  }

  return {
    success: true,
    sightingId: inserted.id,
    offsetMeters: inserted.jitter_offset_meters || 200,
  };
}

/**
 * Synchronizes a mobile CatProfile to `public.cats` in Supabase so that physical
 * Lost Posters with QR codes (`/sighting/?id=<uuid>`) resolve live missing cats via
 * `v_public_missing_cats`.
 */
export async function syncCatProfileToSupabase(
  supabaseClient: any,
  cat: CatProfile
): Promise<boolean> {
  const validCatId = toValidUuid(cat.id);
  if (!validCatId) {
    return false;
  }

  const { userId } = await ensureAuthenticatedUser(supabaseClient);

  const payload: Record<string, unknown> = {
    id: validCatId,
    owner_id: userId,
    name: cat.name,
    breed: cat.breed || 'Domestic Shorthair',
    gender: cat.gender || 'Unknown',
    is_neutered: cat.isNeutered ?? true,
    age_years: cat.ageYears ?? null,
    coat_colour: cat.coatColour || cat.coatColor || 'Not specified',
    distinctive_features: cat.distinctiveFeatures || null,
    microchip_number: cat.microchipNumber && cat.microchipNumber.trim().length > 0 ? cat.microchipNumber.trim() : null,
    photo_url: cat.photoUrl || null,
    status: cat.status,
    missing_since: cat.status === 'missing' ? cat.missingSince || new Date().toISOString() : null,
    home_address_approx: cat.homeAddressApprox || null,
    emergency_phone: cat.emergencyPhone || null,
    medical_notes: cat.medicalNotes || null,
  };

  if (
    cat.homeCoords &&
    Number.isFinite(cat.homeCoords.latitude) &&
    Number.isFinite(cat.homeCoords.longitude)
  ) {
    payload.home_location = `SRID=4326;POINT(${cat.homeCoords.longitude} ${cat.homeCoords.latitude})`;
  }

  const { error } = await supabaseClient.from('cats').upsert(payload, { onConflict: 'id' });
  if (error) {
    console.warn('[sightingService] Could not sync cat profile to Supabase:', error.message);
    return false;
  }
  return true;
}

/**
 * Deletes a cat profile from `public.cats` in Supabase when removed locally.
 */
export async function deleteCatProfileFromSupabase(
  supabaseClient: any,
  catId: string
): Promise<boolean> {
  const validCatId = toValidUuid(catId);
  if (!validCatId) return false;

  await ensureAuthenticatedUser(supabaseClient);
  const { error } = await supabaseClient.from('cats').delete().eq('id', validCatId);
  return !error;
}

/**
 * Seamlessly upgrades an anonymous finder account to a permanent registered account.
 * Merges past anonymous sightings into the new permanent profile!
 */
export async function linkAnonymousAccountToPermanent(
  supabaseClient: any,
  provider: 'apple' | 'google'
): Promise<void> {
  const { error } = await supabaseClient.auth.linkIdentity({
    provider,
  });

  if (error) {
    throw new Error(`Failed to link identity: ${error.message}`);
  }
}
