// ============================================================================
// Find My Cat — Supabase Edge Function: stripe-webhook
// Runtime: Deno / Supabase Edge Functions
// Description: Processes incoming Stripe webhook events (checkout.session.completed,
//              payment_intent.succeeded) to activate Amber Alerts.
// ============================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
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

    const event = await req.json();
    const eventType = event.type;

    if (eventType === "checkout.session.completed" || eventType === "payment_intent.succeeded") {
      const dataObj = event.data.object;
      const metadata = dataObj.metadata || {};
      const productType = metadata.productType;
      const catId = metadata.catId;
      const userId = dataObj.client_reference_id !== "anonymous" ? dataObj.client_reference_id : null;
      const sessionId = dataObj.id;
      const paymentIntentId = dataObj.payment_intent || dataObj.id;

      // 1. If Amber Alert broadcast was purchased (£14.99)
      if (productType === "amber_alert" && catId) {
        // Activate 2-mile emergency radar broadcast via stored procedure
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

      // 2. Update payment transaction record status
      await supabaseClient
        .from("payment_transactions")
        .update({
          status: "succeeded",
          stripe_payment_intent_id: paymentIntentId,
          metadata: {
            ...metadata,
            stripeEventId: event.id,
            completedAt: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .or(`stripe_checkout_session_id.eq.${sessionId},stripe_payment_intent_id.eq.${paymentIntentId}`);
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
