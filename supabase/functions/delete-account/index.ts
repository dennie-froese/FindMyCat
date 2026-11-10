// ============================================================================
// Find My Cat — Supabase Edge Function: delete-account
// Runtime: Deno / Supabase Edge Functions
// Description: Permanently deletes the authenticated user's storage objects
//              (`fmc-photos`), sightings, community alerts, cats, profile, and
//              Supabase Auth user record (`auth.admin.deleteUser`).
//              Satisfies Apple App Store Review Guideline 5.1.1(v).
// ============================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function extractStoragePathFromUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;
  const marker = "/fmc-photos/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const rawPath = url.slice(idx + marker.length).split("?")[0].trim();
  if (!rawPath || rawPath.includes("..")) return null;
  return rawPath;
}

serve(async (req: Request) => {
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user?.id) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired user session", details: userError }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    const adminClient = supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey)
      : userClient;

    // 1. Collect and delete any user-uploaded photos in `fmc-photos` Storage bucket
    const photoPaths = new Set<string>();
    try {
      const [{ data: catRows }, { data: sightingRows }] = await Promise.all([
        adminClient.from("cats").select("photo_url").eq("owner_id", userId),
        adminClient.from("sightings").select("photo_url").eq("reporter_id", userId),
      ]);

      for (const row of catRows || []) {
        const p = extractStoragePathFromUrl(row?.photo_url);
        if (p) photoPaths.add(p);
      }
      for (const row of sightingRows || []) {
        const p = extractStoragePathFromUrl(row?.photo_url);
        if (p) photoPaths.add(p);
      }

      if (photoPaths.size > 0 && adminClient.storage?.from) {
        await adminClient.storage.from("fmc-photos").remove(Array.from(photoPaths));
      }
    } catch (storageErr) {
      console.warn("[delete-account] Non-fatal storage cleanup warning:", storageErr);
    }

    // 2. Delete user rows across public tables
    await adminClient.from("community_alerts").delete().eq("created_by", userId);
    await adminClient.from("sightings").delete().eq("reporter_id", userId);
    await adminClient.from("cats").delete().eq("owner_id", userId);
    await adminClient.from("profiles").delete().eq("id", userId);

    // 3. Delete the Supabase Auth user record (or invoke delete_my_account RPC fallback)
    if (supabaseServiceKey && adminClient.auth?.admin?.deleteUser) {
      const { error: deleteUserErr } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteUserErr) {
        console.warn("[delete-account] auth.admin.deleteUser fallback to RPC:", deleteUserErr);
        if (typeof userClient.rpc === "function") {
          await userClient.rpc("delete_my_account");
        }
      }
    } else if (typeof userClient.rpc === "function") {
      await userClient.rpc("delete_my_account");
    }

    return new Response(
      JSON.stringify({
        success: true,
        deletedUserId: userId,
        deletedPhotoCount: photoPaths.size,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: "Account deletion failed", details: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
