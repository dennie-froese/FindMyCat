// ============================================================================
// Find My Cat — Supabase Edge Function: report-sighting
// Runtime: Deno / Supabase Edge Functions (Free Tier)
// Architecture: Combines Supabase Anonymous Auth (Option A) with
//               Cloudflare Turnstile & Edge Abuse Defense (Option B).
// ============================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX = 10;
const rateLimitStore = new Map<string, number[]>();

export function resetRateLimitStore(): void {
  rateLimitStore.clear();
}

function checkRateLimit(key: string, maxRequests: number, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (rateLimitStore.get(key) ?? []).filter((t) => t > windowStart);
  if (timestamps.length >= maxRequests) {
    const oldestInWindow = timestamps[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldestInWindow + RATE_LIMIT_WINDOW_MS - now) / 1000));
    rateLimitStore.set(key, timestamps);
    return { allowed: false, retryAfterSec };
  }
  timestamps.push(now);
  rateLimitStore.set(key, timestamps);
  return { allowed: true, retryAfterSec: 0 };
}

function isValidCoordinateInput(val: unknown): boolean {
  if (typeof val === "number") return Number.isFinite(val);
  if (typeof val === "string" && val.trim() !== "") return Number.isFinite(Number(val));
  return false;
}

function isSafePhotoUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^(javascript|vbscript):/i.test(trimmed)) return false;
  if (/^data:(?!image\/)/i.test(trimmed)) return false;
  return true;
}

interface ReportSightingPayload {
  catId?: string;
  catNameHint?: string;
  photoUrl: string;
  coatColour?: string;
  collarDescription?: string;
  notes?: string;
  approximateLocationName?: string;
  latitude: number;
  longitude: number;
  turnstileToken?: string;
}

serve(async (req: Request) => {
  // 1. Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    // 2. Validate Supabase Anonymous/Authenticated User Session (Option A)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization session. Call supabase.auth.signInAnonymously() first." }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
    const configuredRateLimit = Number(Deno.env.get("RATE_LIMIT_MAX_REQUESTS"));
    const maxRequestsPerMinute =
      Number.isFinite(configuredRateLimit) && configuredRateLimit > 0
        ? configuredRateLimit
        : DEFAULT_RATE_LIMIT_MAX;

    // Client authenticated with the caller's JWT
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid user session. Re-authenticate anonymously.", details: userError }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // 2b. Per-user / per-IP sliding-window rate limit check
    const clientIp = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
    const rateLimitKey = clientIp ? `${user.id}:${clientIp}` : user.id;
    const rateStatus = checkRateLimit(rateLimitKey, maxRequestsPerMinute);
    if (!rateStatus.allowed) {
      return new Response(
        JSON.stringify({
          error: "Too many sighting reports submitted recently. Please wait before submitting again.",
          retryAfterSeconds: rateStatus.retryAfterSec,
        }),
        {
          status: 429,
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "application/json",
            "Retry-After": String(rateStatus.retryAfterSec),
          },
        }
      );
    }

    // Parse request body
    const body: ReportSightingPayload = await req.json();
    const {
      catId,
      catNameHint,
      photoUrl,
      coatColour,
      collarDescription,
      notes,
      approximateLocationName,
      latitude,
      longitude,
      turnstileToken,
    } = body;

    // Validate essential coordinates & media
    const latNum = Number(latitude);
    const lonNum = Number(longitude);
    if (
      !isValidCoordinateInput(latitude) ||
      !isValidCoordinateInput(longitude) ||
      latNum < -90 ||
      latNum > 90 ||
      lonNum < -180 ||
      lonNum > 180 ||
      !isSafePhotoUrl(photoUrl)
    ) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid required fields: photoUrl, latitude [-90..90], and longitude [-180..180] are mandatory." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validCatId = catId && UUID_REGEX.test(catId) ? catId : null;

    // 3. Verify Cloudflare Turnstile Token (Option B: Free Anti-Abuse Perimeter)
    // In production with TURNSTILE_SECRET_KEY set, verify against Cloudflare's free /siteverify endpoint
    if (turnstileSecret) {
      if (!turnstileToken) {
        return new Response(
          JSON.stringify({ error: "Cloudflare Turnstile verification token missing." }),
          { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      const clientIp = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "";
      const formData = new URLSearchParams();
      formData.append("secret", turnstileSecret);
      formData.append("response", turnstileToken);
      if (clientIp) formData.append("remoteip", clientIp);

      const turnstileRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: formData,
      });

      const turnstileData = await turnstileRes.json();
      if (!turnstileData.success) {
        return new Response(
          JSON.stringify({
            error: "Turnstile bot challenge failed.",
            codes: turnstileData["error-codes"],
          }),
          { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }
    }

    // 4. Insert sighting into PostgreSQL using PostGIS
    // The database trigger trg_sightings_privacy_shield will automatically compute
    // jittered_location (150m-250m) and jitter_offset_meters!
    const { data: insertedSighting, error: insertError } = await supabaseClient
      .from("sightings")
      .insert({
        reporter_id: user.id, // Linked to the anonymous/permanent user (Option A)
        cat_id: validCatId,
        cat_name_hint: catNameHint ?? null,
        photo_url: photoUrl,
        coat_colour: coatColour ?? null,
        collar_description: collarDescription ?? null,
        notes: notes ?? null,
        approximate_location_name: approximateLocationName ?? "Spotted locally",
        exact_location: `SRID=4326;POINT(${lonNum} ${latNum})`,
        is_anonymous: user.is_anonymous ?? true,
        status: "unverified",
      })
      .select("id, cat_id, photo_url, approximate_location_name, jitter_offset_meters, status, observed_at, created_at")
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "Failed to store sighting in database.", details: insertError }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // 5. Success response (Returns sanitized public data + privacy jitter acknowledgment)
    return new Response(
      JSON.stringify({
        success: true,
        sighting: insertedSighting,
        privacyShield: {
          status: "active",
          offsetMeters: insertedSighting.jitter_offset_meters,
          notice: "Residential privacy shield engaged: Coordinates displaced by ~200m on public radar.",
        },
      }),
      { status: 201, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: "Internal server error", details: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
