/**
 * Find My Cat — Sighting Submission Service
 * Implements Option A + Option B Architecture:
 * - Option A: Supabase Native Anonymous Sign-In (Zero signup friction, real auth.uid())
 * - Option B: Edge Function Gateway with Cloudflare Turnstile Verification (100% Free Anti-Abuse)
 */

import { SightingReport } from '../types';

// Replace with your Supabase configuration or environment variables
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key';

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
  if (error || !authData.session) {
    throw new Error(`Failed to establish anonymous session: ${error?.message}`);
  }

  return authData.session.access_token;
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
 * Submits a new sighting report through the Supabase Edge Function (Option B Gateway).
 * 1. Checks/creates anonymous auth session.
 * 2. Transmits payload to the /report-sighting Edge Function.
 * 3. Edge function validates Turnstile and inserts with PostGIS trigger geo-jittering.
 */
export async function submitSightingWithProtection(
  supabaseClient: any,
  params: SubmitSightingParams
): Promise<{ success: boolean; sightingId: string; offsetMeters: number }> {
  // 1. Ensure user is signed in (anonymously or permanently)
  const token = await ensureActiveSession(supabaseClient);

  // 2. Call the Edge Function Gateway
  const response = await fetch(`${SUPABASE_URL}/functions/v1/report-sighting`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      catId: params.catId,
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

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || 'Failed to submit sighting');
  }

  return {
    success: true,
    sightingId: result.sighting.id,
    offsetMeters: result.privacyShield?.offsetMeters || 200,
  };
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
