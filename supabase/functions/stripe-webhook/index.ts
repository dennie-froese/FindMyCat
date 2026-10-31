// ============================================================================
// Find My Cat — Supabase Edge Function: stripe-webhook
// Runtime: Deno / Supabase Edge Functions
// Description: Verifies incoming Stripe webhook signatures (HMAC-SHA256) and
//              processes checkout.session.completed / payment_intent.succeeded
//              events to activate Amber Alerts.
// ============================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300; // 5 minutes
const SAFE_STRIPE_ID_REGEX = /^[a-zA-Z0-9_-]{3,128}$/;

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string
): Promise<boolean> {
  const parts = signatureHeader.split(",").map((part) => part.trim());
  let timestampStr = "";
  const v1Signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=", 2);
    if (key === "t" && value) {
      timestampStr = value;
    } else if (key === "v1" && value) {
      v1Signatures.push(value);
    }
  }

  if (!timestampStr || v1Signatures.length === 0) {
    return false;
  }

  const timestamp = Number(timestampStr);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signedPayload = `${timestampStr}.${rawBody}`;
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const expectedHex = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return v1Signatures.some((sig) => timingSafeEqualHex(sig.toLowerCase(), expectedHex));
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
    const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

    if (!supabaseUrl || !supabaseServiceKey || !stripeWebhookSecret) {
      console.error("Missing required server configuration (SUPABASE_SERVICE_ROLE_KEY or STRIPE_WEBHOOK_SECRET)");
      return new Response(JSON.stringify({ error: "Webhook server misconfigured" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const signatureHeader = req.headers.get("stripe-signature");
    if (!signatureHeader) {
      return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    const isValid = await verifyStripeSignature(rawBody, signatureHeader, stripeWebhookSecret);
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid Stripe webhook signature" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const event = JSON.parse(rawBody);
    const eventType = event.type;

    if (eventType === "checkout.session.completed" || eventType === "payment_intent.succeeded") {
      const dataObj = event.data?.object ?? {};
      const metadata = dataObj.metadata || {};
      const productType = metadata.productType;
      const catId = metadata.catId;
      const userId = dataObj.client_reference_id && dataObj.client_reference_id !== "anonymous"
        ? dataObj.client_reference_id
        : null;
      const sessionId = typeof dataObj.id === "string" ? dataObj.id : "";
      const paymentIntentId = typeof dataObj.payment_intent === "string"
        ? dataObj.payment_intent
        : sessionId;

      // 1. If Amber Alert broadcast was purchased (£14.99)
      if (productType === "amber_alert" && catId) {
        const { data: alertId, error: alertError } = await supabaseClient.rpc("activate_amber_alert", {
          p_cat_id: catId,
          p_user_id: userId,
          p_payment_intent_id: paymentIntentId,
          p_broadcast_radius_meters: 3218.69, // 2-mile radius
        });

        if (alertError) {
          console.error("Failed to activate amber alert:", alertError);
        } else {
          console.log(`Successfully activated Amber Alert broadcast ${alertId} for cat ${catId}`);
        }
      }

      // 2. Update payment transaction record status using parameterized equality filters
      const updatePayload = {
        status: "succeeded",
        stripe_payment_intent_id: paymentIntentId,
        metadata: {
          ...metadata,
          stripeEventId: event.id,
          completedAt: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      };

      if (SAFE_STRIPE_ID_REGEX.test(sessionId)) {
        await supabaseClient
          .from("payment_transactions")
          .update(updatePayload)
          .eq("stripe_checkout_session_id", sessionId);
      }

      if (SAFE_STRIPE_ID_REGEX.test(paymentIntentId) && paymentIntentId !== sessionId) {
        await supabaseClient
          .from("payment_transactions")
          .update(updatePayload)
          .eq("stripe_payment_intent_id", paymentIntentId);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Webhook processing error:", message);
    return new Response(JSON.stringify({ error: "Webhook error", details: message }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
