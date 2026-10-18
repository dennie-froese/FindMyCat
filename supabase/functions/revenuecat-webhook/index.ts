// ============================================================================
// Find My Cat — Supabase Edge Function: revenuecat-webhook
// Runtime: Deno / Supabase Edge Functions
// Description: Processes RevenueCat StoreKit 2 & Google Play Billing webhooks
//              to sync the £2.99/mo "Cat Guardian" subscription entitlement.
// ============================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-revenuecat-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const eventWrapper = await req.json();
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
    const expirationDate = expirationAtMs ? new Date(expirationAtMs).toISOString() : null;

    let isSubscriber = false;
    let tier = "free";

    switch (eventType) {
      case "INITIAL_PURCHASE":
      case "RENEWAL":
      case "UNCANCELLATION":
        isSubscriber = isGuardianEntitlement;
        tier = "guardian_monthly";
        break;

      case "CANCELLATION":
        // Access remains until expiration date
        isSubscriber = expirationAtMs ? expirationAtMs > Date.now() : false;
        tier = isSubscriber ? "guardian_monthly" : "free";
        break;

      case "EXPIRATION":
      case "BILLING_ISSUE":
        isSubscriber = false;
        tier = "free";
        break;

      default:
        console.log(`Unhandled RevenueCat event: ${eventType}`);
        break;
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
    const amountPence = price ? Math.round(price * 100) : 299; // £2.99
    await supabaseClient.from("payment_transactions").insert({
      user_id: appUserId && appUserId.length === 36 ? appUserId : null,
      product_type: "cat_guardian_monthly",
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
