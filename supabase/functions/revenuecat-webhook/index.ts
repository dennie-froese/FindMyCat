// ============================================================================
// Find My Cat — Supabase Edge Function: revenuecat-webhook
// Runtime: Deno / Supabase Edge Functions
// Description: Verifies RevenueCat webhook authorization / HMAC signature and
//              syncs the £2.99/mo "Cat Guardian" subscription entitlement.
// ============================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-revenuecat-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

async function verifyRevenueCatWebhook(
  req: Request,
  rawBody: string,
  webhookSecret: string
): Promise<boolean> {
  // 1. Check Authorization header configured in RevenueCat dashboard
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader) {
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : authHeader.trim();
    if (token && timingSafeEqual(token, webhookSecret)) {
      return true;
    }
  }

  // 2. Check X-RevenueCat-Signature HMAC-SHA256 header if provided
  const signatureHeader = req.headers.get("x-revenuecat-signature") ?? "";
  if (signatureHeader) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const expectedHex = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (timingSafeEqual(signatureHeader.trim().toLowerCase(), expectedHex)) {
      return true;
    }
  }

  return false;
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const revenueCatWebhookSecret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";

    if (!supabaseUrl || !supabaseServiceKey || !revenueCatWebhookSecret) {
      console.error("Missing required server configuration (SUPABASE_SERVICE_ROLE_KEY or REVENUECAT_WEBHOOK_SECRET)");
      return new Response(JSON.stringify({ error: "Webhook server misconfigured" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    const isAuthorized = await verifyRevenueCatWebhook(req, rawBody, revenueCatWebhookSecret);
    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Unauthorized webhook request" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const eventWrapper = JSON.parse(rawBody);
    const event = eventWrapper.event;

    if (!event) {
      return new Response(JSON.stringify({ error: "Invalid webhook format" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const {
      type: eventType,
      app_user_id: appUserId,
      product_id: productId,
      price_in_purchased_currency: price,
      currency,
      expiration_at_ms: expirationAtMs,
      transaction_id: transactionId,
      entitlement_ids: entitlementIds = [],
    } = event;

    const isGuardianEntitlement = entitlementIds.includes("cat_guardian") || productId?.includes("guardian");
    const isAnnualProduct = typeof productId === "string" && productId.toLowerCase().includes("annual");
    const activeTier = isAnnualProduct ? "guardian_annual" : "guardian_monthly";
    const expirationDate = expirationAtMs ? new Date(expirationAtMs).toISOString() : null;

    let isSubscriber = false;
    let tier = "free";

    switch (eventType) {
      case "INITIAL_PURCHASE":
      case "RENEWAL":
      case "UNCANCELLATION":
        isSubscriber = isGuardianEntitlement;
        tier = isSubscriber ? activeTier : "free";
        break;

      case "CANCELLATION":
        // Access remains until expiration date
        isSubscriber = isGuardianEntitlement && (expirationAtMs ? expirationAtMs > Date.now() : false);
        tier = isSubscriber ? activeTier : "free";
        break;

      case "EXPIRATION":
      case "BILLING_ISSUE":
        isSubscriber = false;
        tier = "free";
        break;

      default:
        console.log(`Unhandled RevenueCat event: ${eventType}`);
        return new Response(JSON.stringify({ success: true, ignoredEvent: eventType }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
    }

    // 1. Update user profile entitlement in Supabase
    if (appUserId && appUserId !== "anonymous") {
      const { error: profileError } = await supabaseClient
        .from("profiles")
        .update({
          is_guardian_subscriber: isSubscriber,
          guardian_tier: tier,
          guardian_expires_at: expirationDate,
          revenuecat_customer_id: appUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", appUserId);

      if (profileError) {
        console.warn("Could not update profile by ID, checking revenuecat_customer_id:", profileError);
        await supabaseClient
          .from("profiles")
          .update({
            is_guardian_subscriber: isSubscriber,
            guardian_tier: tier,
            guardian_expires_at: expirationDate,
            updated_at: new Date().toISOString(),
          })
          .eq("revenuecat_customer_id", appUserId);
      }
    }

    // 2. Log transaction
    const amountPence = price ? Math.round(price * 100) : (isAnnualProduct ? 2999 : 299);
    await supabaseClient.from("payment_transactions").insert({
      user_id: appUserId && appUserId.length === 36 ? appUserId : null,
      product_type: isAnnualProduct ? "cat_guardian_annual" : "cat_guardian_monthly",
      provider: "revenuecat",
      amount_pence: amountPence,
      currency: (currency || "gbp").toLowerCase(),
      revenuecat_transaction_id: transactionId || event.id,
      status: isSubscriber ? "succeeded" : "failed",
      metadata: {
        eventType,
        productId,
        expirationDate,
        rawEvent: event,
      },
    });

    return new Response(JSON.stringify({ success: true, processedEvent: eventType }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("RevenueCat webhook error:", message);
    return new Response(JSON.stringify({ error: "Webhook error", details: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
