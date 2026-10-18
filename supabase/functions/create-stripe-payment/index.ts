// ============================================================================
// Find My Cat — Supabase Edge Function: create-stripe-payment
// Runtime: Deno / Supabase Edge Functions
// Description: Initiates Stripe payment for £14.99 "Amber Alert"
//              2-Mile Emergency Broadcasts.
// ============================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CreatePaymentRequest {
  productType: "amber_alert";
  catId: string;
  catName?: string;
  customerEmail?: string;
  returnUrl?: string;
}

const PRODUCT_CONFIG = {
  amber_alert: {
    amountPence: 1499, // £14.99
    name: "Emergency Amber Alert (2-Mile Radar Broadcast)",
    description: "High-priority emergency radar blitz across a 2-mile radius with instant lookout notifications.",
  },
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
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    const authHeader = req.headers.get("Authorization");
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    let userId: string | null = null;
    if (authHeader) {
      const userRes = await supabaseClient.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = userRes.data.user?.id ?? null;
    }

    const payload: CreatePaymentRequest = await req.json();
    const { productType, catId, catName, customerEmail, returnUrl } = payload;

    if (!productType || productType !== "amber_alert") {
      return new Response(
        JSON.stringify({ error: "Invalid product type. Must be 'amber_alert'." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const product = PRODUCT_CONFIG.amber_alert;

    // If Stripe secret key is configured, create live Stripe Checkout Session
    if (stripeSecretKey) {
      const successUrl = returnUrl || "https://findmycat.app/checkout-success?session_id={CHECKOUT_SESSION_ID}";
      const cancelUrl = returnUrl || "https://findmycat.app/checkout-cancelled";

      const stripeBody = new URLSearchParams();
      stripeBody.append("mode", "payment");
      stripeBody.append("success_url", successUrl);
      stripeBody.append("cancel_url", cancelUrl);
      if (customerEmail) stripeBody.append("customer_email", customerEmail);
      stripeBody.append("client_reference_id", userId || "anonymous");

      stripeBody.append("metadata[productType]", "amber_alert");
      stripeBody.append("metadata[catId]", catId);
      if (catName) stripeBody.append("metadata[catName]", catName);

      stripeBody.append("line_items[0][price_data][currency]", "gbp");
      stripeBody.append("line_items[0][price_data][unit_amount]", product.amountPence.toString());
      stripeBody.append("line_items[0][price_data][product_data][name]", product.name);
      stripeBody.append("line_items[0][price_data][product_data][description]", product.description);
      stripeBody.append("line_items[0][quantity]", "1");

      const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: stripeBody.toString(),
      });

      const session = await stripeResponse.json();

      if (!stripeResponse.ok) {
        return new Response(JSON.stringify({ error: "Stripe API error", details: session }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      // Record transaction in Supabase
      await supabaseClient.from("payment_transactions").insert({
        user_id: userId,
        cat_id: catId,
        product_type: "amber_alert_broadcast",
        provider: "stripe",
        amount_pence: product.amountPence,
        currency: "gbp",
        stripe_checkout_session_id: session.id,
        status: "pending",
        metadata: { catName, live: true },
      });

      return new Response(
        JSON.stringify({
          success: true,
          mode: "stripe_live",
          checkoutUrl: session.url,
          sessionId: session.id,
          amountPence: product.amountPence,
          currency: "gbp",
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Local / Sandbox Fallback (when STRIPE_SECRET_KEY is not yet deployed)
    const mockSessionId = `cs_test_mock_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const mockPaymentIntentId = `pi_test_mock_${Date.now()}`;

    // Record mock transaction in database
    await supabaseClient.from("payment_transactions").insert({
      user_id: userId,
      cat_id: catId,
      product_type: "amber_alert_broadcast",
      provider: "stripe",
      amount_pence: product.amountPence,
      currency: "gbp",
      stripe_checkout_session_id: mockSessionId,
      stripe_payment_intent_id: mockPaymentIntentId,
      status: "pending",
      metadata: { catName, sandbox: true },
    });

    return new Response(
      JSON.stringify({
        success: true,
        mode: "sandbox",
        sessionId: mockSessionId,
        paymentIntentId: mockPaymentIntentId,
        amountPence: product.amountPence,
        amountDisplay: `£${(product.amountPence / 100).toFixed(2)}`,
        productName: product.name,
        checkoutUrl: `https://checkout.stripe.com/pay/${mockSessionId}`,
        notice: "Sandbox mode active: configure STRIPE_SECRET_KEY in production to process live payments.",
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: "Internal server error", details: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
