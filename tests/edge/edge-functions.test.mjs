import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// ----------------------------------------------------------------------------
// 1. Deno & ESM URL Loader Shim for Node.js Test Runner
//    Intercepts https://deno.land/... and https://esm.sh/... imports inside
//    supabase/functions/*/index.ts without modifying production Edge code.
// ----------------------------------------------------------------------------
const loaderSource = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("https://deno.land/") && specifier.endsWith("/http/server.ts")) {
    return {
      url: "data:text/javascript,export function serve(handler) { globalThis.__registeredDenoServeHandler = handler; }",
      shortCircuit: true,
    };
  }
  if (specifier.startsWith("https://esm.sh/@supabase/supabase-js")) {
    return {
      url: "data:text/javascript,export function createClient(...args) { return globalThis.__mockCreateClient(...args); }",
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
`;

register(`data:text/javascript,${encodeURIComponent(loaderSource)}`);

// Set up global Deno.env shim before importing Edge Function modules
const envStore = new Map();
globalThis.Deno = {
  env: {
    get: (key) => envStore.get(key),
    set: (key, value) => envStore.set(key, value),
    delete: (key) => envStore.delete(key),
    clear: () => envStore.clear(),
  },
};

// Dynamically load each Edge Function and capture its registered serve(req) handler
globalThis.__registeredDenoServeHandler = null;
const reportSightingMod = await import('../../supabase/functions/report-sighting/index.ts');
const reportSightingHandler = globalThis.__registeredDenoServeHandler;

globalThis.__registeredDenoServeHandler = null;
await import('../../supabase/functions/create-stripe-payment/index.ts');
const createStripePaymentHandler = globalThis.__registeredDenoServeHandler;

globalThis.__registeredDenoServeHandler = null;
await import('../../supabase/functions/stripe-webhook/index.ts');
const stripeWebhookHandler = globalThis.__registeredDenoServeHandler;

globalThis.__registeredDenoServeHandler = null;
await import('../../supabase/functions/revenuecat-webhook/index.ts');
const revenueCatWebhookHandler = globalThis.__registeredDenoServeHandler;

// Helper to compute HMAC-SHA256 hex digest using Web Crypto API
async function hmacSha256Hex(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const originalFetch = globalThis.fetch;

describe('Supabase Edge Functions Unit Test Suite', () => {
  beforeEach(() => {
    envStore.clear();
    envStore.set('SUPABASE_URL', 'https://mock-project.supabase.co');
    envStore.set('SUPABASE_ANON_KEY', 'mock-anon-key');
    envStore.set('SUPABASE_SERVICE_ROLE_KEY', 'mock-service-role-key');
    globalThis.fetch = originalFetch;
    if (typeof reportSightingMod.resetRateLimitStore === 'function') {
      reportSightingMod.resetRateLimitStore();
    }
  });

  // ==========================================================================
  // 1. report-sighting Edge Function
  // ==========================================================================
  describe('1. report-sighting (Anonymous Auth + Turnstile + Rate Limit + PostGIS)', () => {
    let insertedSightingPayload = null;
    let mockUser = { id: '11111111-2222-4333-8444-555555555555', is_anonymous: true };
    let mockUserError = null;
    let mockInsertError = null;

    beforeEach(() => {
      insertedSightingPayload = null;
      mockUser = { id: '11111111-2222-4333-8444-555555555555', is_anonymous: true };
      mockUserError = null;
      mockInsertError = null;

      globalThis.__mockCreateClient = () => ({
        auth: {
          getUser: async () => ({
            data: { user: mockUser },
            error: mockUserError,
          }),
        },
        from: (table) => {
          assert.strictEqual(table, 'sightings');
          return {
            insert: (payload) => {
              insertedSightingPayload = payload;
              return {
                select: () => ({
                  single: async () => ({
                    data: mockInsertError
                      ? null
                      : {
                          id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
                          cat_id: payload.cat_id,
                          photo_url: payload.photo_url,
                          approximate_location_name: payload.approximate_location_name,
                          jitter_offset_meters: 174,
                          status: 'unverified',
                        },
                    error: mockInsertError,
                  }),
                }),
              };
            },
          };
        },
      });
    });

    test('Handles CORS OPTIONS preflight and rejects non-POST methods', async () => {
      const optRes = await reportSightingHandler(
        new Request('https://edge.local/report-sighting', { method: 'OPTIONS' })
      );
      assert.strictEqual(optRes.status, 200);
      assert.strictEqual(optRes.headers.get('Access-Control-Allow-Origin'), '*');

      const getRes = await reportSightingHandler(
        new Request('https://edge.local/report-sighting', { method: 'GET' })
      );
      assert.strictEqual(getRes.status, 405);
    });

    test('Rejects missing Authorization header or invalid anonymous user session with 401', async () => {
      const noAuthRes = await reportSightingHandler(
        new Request('https://edge.local/report-sighting', {
          method: 'POST',
          body: JSON.stringify({ photoUrl: 'https://example.com/cat.jpg', latitude: 51.5, longitude: -0.03 }),
        })
      );
      assert.strictEqual(noAuthRes.status, 401);

      mockUser = null;
      mockUserError = { message: 'JWT expired' };
      const badSessionRes = await reportSightingHandler(
        new Request('https://edge.local/report-sighting', {
          method: 'POST',
          headers: { Authorization: 'Bearer expired-jwt' },
          body: JSON.stringify({ photoUrl: 'https://example.com/cat.jpg', latitude: 51.5, longitude: -0.03 }),
        })
      );
      assert.strictEqual(badSessionRes.status, 401);
    });

    test('Validates required payload fields (coordinates range, empty strings, and unsafe photoUrl)', async () => {
      const invalidPayloads = [
        { photoUrl: 'https://example.com/cat.jpg', latitude: 95, longitude: -0.03 }, // lat > 90
        { photoUrl: 'https://example.com/cat.jpg', latitude: 51.5, longitude: -195 }, // lon < -180
        { photoUrl: 'https://example.com/cat.jpg', latitude: '', longitude: -0.03 }, // empty string coercion guard
        { photoUrl: 'https://example.com/cat.jpg', latitude: true, longitude: -0.03 }, // boolean coercion guard
        { photoUrl: '   ', latitude: 51.5, longitude: -0.03 }, // blank photoUrl
        { photoUrl: 'javascript:alert(1)', latitude: 51.5, longitude: -0.03 }, // XSS URI guard
      ];

      for (const payload of invalidPayloads) {
        const res = await reportSightingHandler(
          new Request('https://edge.local/report-sighting', {
            method: 'POST',
            headers: { Authorization: 'Bearer valid-jwt' },
            body: JSON.stringify(payload),
          })
        );
        assert.strictEqual(res.status, 400, `Expected 400 for payload: ${JSON.stringify(payload)}`);
      }
    });

    test('Sanitizes non-UUID catId to null while preserving valid RFC-4122 UUID catId', async () => {
      // 1. Legacy non-UUID catId ("cat-1") -> sanitized to null
      const resLegacy = await reportSightingHandler(
        new Request('https://edge.local/report-sighting', {
          method: 'POST',
          headers: { Authorization: 'Bearer valid-jwt' },
          body: JSON.stringify({
            catId: 'cat-1',
            catNameHint: 'Mochi',
            photoUrl: 'https://example.com/mochi.jpg',
            latitude: 51.5362,
            longitude: -0.0385,
          }),
        })
      );
      assert.strictEqual(resLegacy.status, 201);
      assert.strictEqual(insertedSightingPayload.cat_id, null);
      assert.strictEqual(insertedSightingPayload.exact_location, 'SRID=4326;POINT(-0.0385 51.5362)');

      // 2. Valid UUID catId -> preserved in cat_id column
      const validUuid = '123e4567-e89b-42d3-a456-426614174000';
      const resUuid = await reportSightingHandler(
        new Request('https://edge.local/report-sighting', {
          method: 'POST',
          headers: { Authorization: 'Bearer valid-jwt' },
          body: JSON.stringify({
            catId: validUuid,
            photoUrl: 'https://example.com/mochi.jpg',
            latitude: 51.5362,
            longitude: -0.0385,
          }),
        })
      );
      assert.strictEqual(resUuid.status, 201);
      assert.strictEqual(insertedSightingPayload.cat_id, validUuid);
    });

    test('Enforces Cloudflare Turnstile verification when TURNSTILE_SECRET_KEY is configured', async () => {
      envStore.set('TURNSTILE_SECRET_KEY', 'cf-secret-test-key');

      // 1. Missing turnstileToken -> 403
      const missingTokenRes = await reportSightingHandler(
        new Request('https://edge.local/report-sighting', {
          method: 'POST',
          headers: { Authorization: 'Bearer valid-jwt' },
          body: JSON.stringify({
            photoUrl: 'https://example.com/cat.jpg',
            latitude: 51.5362,
            longitude: -0.0385,
          }),
        })
      );
      assert.strictEqual(missingTokenRes.status, 403);

      // 2. Failed Turnstile challenge -> 403
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
          status: 200,
        });

      const failedChallengeRes = await reportSightingHandler(
        new Request('https://edge.local/report-sighting', {
          method: 'POST',
          headers: { Authorization: 'Bearer valid-jwt', 'cf-connecting-ip': '203.0.113.5' },
          body: JSON.stringify({
            photoUrl: 'https://example.com/cat.jpg',
            latitude: 51.5362,
            longitude: -0.0385,
            turnstileToken: 'bad-token',
          }),
        })
      );
      assert.strictEqual(failedChallengeRes.status, 403);

      // 3. Passing Turnstile challenge -> 201 Created
      let verifiedUrl = '';
      let verifiedBody = '';
      globalThis.fetch = async (url, init) => {
        verifiedUrl = String(url);
        verifiedBody = init.body.toString();
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      };

      const passChallengeRes = await reportSightingHandler(
        new Request('https://edge.local/report-sighting', {
          method: 'POST',
          headers: { Authorization: 'Bearer valid-jwt', 'cf-connecting-ip': '203.0.113.5' },
          body: JSON.stringify({
            photoUrl: 'https://example.com/cat.jpg',
            latitude: 51.5362,
            longitude: -0.0385,
            turnstileToken: 'valid-turnstile-token',
          }),
        })
      );
      assert.strictEqual(passChallengeRes.status, 201);
      assert.strictEqual(verifiedUrl, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
      assert.match(verifiedBody, /secret=cf-secret-test-key/);
      assert.match(verifiedBody, /response=valid-turnstile-token/);
      assert.match(verifiedBody, /remoteip=203\.0\.113\.5/);

      const bodyJson = await passChallengeRes.json();
      assert.strictEqual(bodyJson.success, true);
      assert.strictEqual(bodyJson.privacyShield.status, 'active');
      assert.strictEqual(bodyJson.privacyShield.offsetMeters, 174);
    });

    test('Enforces sliding-window rate limiting (429 Too Many Requests with Retry-After)', async () => {
      envStore.set('RATE_LIMIT_MAX_REQUESTS', '2');

      const makeReq = () =>
        reportSightingHandler(
          new Request('https://edge.local/report-sighting', {
            method: 'POST',
            headers: { Authorization: 'Bearer valid-jwt', 'cf-connecting-ip': '198.51.100.42' },
            body: JSON.stringify({
              photoUrl: 'https://example.com/cat.jpg',
              latitude: 51.5362,
              longitude: -0.0385,
            }),
          })
        );

      const res1 = await makeReq();
      const res2 = await makeReq();
      const res3 = await makeReq(); // Exceeds limit of 2 per minute

      assert.strictEqual(res1.status, 201);
      assert.strictEqual(res2.status, 201);
      assert.strictEqual(res3.status, 429);
      assert.ok(Number(res3.headers.get('Retry-After')) >= 1, 'Should include Retry-After header');
    });
  });

  // ==========================================================================
  // 2. create-stripe-payment Edge Function
  // ==========================================================================
  describe('2. create-stripe-payment (£14.99 Amber Alert Checkout)', () => {
    let insertedTransaction = null;

    beforeEach(() => {
      insertedTransaction = null;
      globalThis.__mockCreateClient = () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: '22222222-3333-4444-8555-666666666666' } },
            error: null,
          }),
        },
        from: (table) => {
          assert.strictEqual(table, 'payment_transactions');
          return {
            insert: async (payload) => {
              insertedTransaction = payload;
              return { error: null };
            },
          };
        },
      });
    });

    test('Rejects invalid productType or missing catId with 400', async () => {
      const badProductRes = await createStripePaymentHandler(
        new Request('https://edge.local/create-stripe-payment', {
          method: 'POST',
          body: JSON.stringify({ productType: 'unknown_item', catId: 'cat-1' }),
        })
      );
      assert.strictEqual(badProductRes.status, 400);

      const missingCatRes = await createStripePaymentHandler(
        new Request('https://edge.local/create-stripe-payment', {
          method: 'POST',
          body: JSON.stringify({ productType: 'amber_alert', catId: '   ' }),
        })
      );
      assert.strictEqual(missingCatRes.status, 400);
    });

    test('Creates sandbox checkout session when STRIPE_SECRET_KEY is not set', async () => {
      const catUuid = '123e4567-e89b-42d3-a456-426614174000';
      const res = await createStripePaymentHandler(
        new Request('https://edge.local/create-stripe-payment', {
          method: 'POST',
          headers: { Authorization: 'Bearer user-jwt' },
          body: JSON.stringify({
            productType: 'amber_alert',
            catId: catUuid,
            catName: 'Mochi',
          }),
        })
      );

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.mode, 'sandbox');
      assert.strictEqual(data.amountPence, 1499);
      assert.strictEqual(data.amountDisplay, '£14.99');
      assert.strictEqual(insertedTransaction.cat_id, catUuid);
      assert.strictEqual(insertedTransaction.amount_pence, 1499);
      assert.strictEqual(insertedTransaction.status, 'pending');
    });

    test('Creates live Stripe Checkout Session when STRIPE_SECRET_KEY is configured', async () => {
      envStore.set('STRIPE_SECRET_KEY', 'sk_test_live_123');

      let stripeReqBody = '';
      globalThis.fetch = async (url, init) => {
        assert.strictEqual(url, 'https://api.stripe.com/v1/checkout/sessions');
        stripeReqBody = init.body;
        return new Response(
          JSON.stringify({
            id: 'cs_live_abc123',
            url: 'https://checkout.stripe.com/c/pay/cs_live_abc123',
          }),
          { status: 200 }
        );
      };

      const res = await createStripePaymentHandler(
        new Request('https://edge.local/create-stripe-payment', {
          method: 'POST',
          headers: { Authorization: 'Bearer user-jwt' },
          body: JSON.stringify({
            productType: 'amber_alert',
            catId: 'demo-cat-1', // non-UUID should be null in cat_id column but preserved in Stripe metadata
            catName: 'Luna',
            customerEmail: 'guardian@example.com',
          }),
        })
      );

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.mode, 'stripe_live');
      assert.strictEqual(data.sessionId, 'cs_live_abc123');
      assert.match(stripeReqBody, /unit_amount.*1499/);
      assert.match(stripeReqBody, /metadata%5BcatId%5D=demo-cat-1/);
      assert.strictEqual(insertedTransaction.cat_id, null);
      assert.strictEqual(insertedTransaction.metadata.catId, 'demo-cat-1');
    });
  });

  // ==========================================================================
  // 3. stripe-webhook Edge Function
  // ==========================================================================
  describe('3. stripe-webhook (HMAC-SHA256 Verification & Amber Alert RPC Activation)', () => {
    const webhookSecret = 'whsec_test_stripe_secret_999';
    let rpcCall = null;
    let updatedTransactions = [];

    beforeEach(() => {
      envStore.set('STRIPE_WEBHOOK_SECRET', webhookSecret);
      rpcCall = null;
      updatedTransactions = [];

      globalThis.__mockCreateClient = () => ({
        rpc: async (fnName, params) => {
          rpcCall = { fnName, params };
          return { data: 'alert-uuid-999', error: null };
        },
        from: (table) => {
          assert.strictEqual(table, 'payment_transactions');
          return {
            update: (payload) => ({
              eq: async (col, val) => {
                updatedTransactions.push({ col, val, payload });
                return { error: null };
              },
            }),
          };
        },
      });
    });

    test('Rejects missing signature, invalid signature, or stale timestamp (>5m tolerance)', async () => {
      const rawBody = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });

      // 1. Missing stripe-signature header -> 401
      const noSigRes = await stripeWebhookHandler(
        new Request('https://edge.local/stripe-webhook', { method: 'POST', body: rawBody })
      );
      assert.strictEqual(noSigRes.status, 401);

      // 2. Bad HMAC digest -> 401
      const nowSec = Math.floor(Date.now() / 1000);
      const badSigRes = await stripeWebhookHandler(
        new Request('https://edge.local/stripe-webhook', {
          method: 'POST',
          headers: { 'stripe-signature': `t=${nowSec},v1=deadbeef0000` },
          body: rawBody,
        })
      );
      assert.strictEqual(badSigRes.status, 401);

      // 3. Expired timestamp (10 minutes ago) -> 401
      const staleSec = nowSec - 600;
      const staleSig = await hmacSha256Hex(webhookSecret, `${staleSec}.${rawBody}`);
      const staleRes = await stripeWebhookHandler(
        new Request('https://edge.local/stripe-webhook', {
          method: 'POST',
          headers: { 'stripe-signature': `t=${staleSec},v1=${staleSig}` },
          body: rawBody,
        })
      );
      assert.strictEqual(staleRes.status, 401);
    });

    test('Verifies valid HMAC-SHA256 signature and triggers activate_amber_alert RPC', async () => {
      const eventPayload = {
        id: 'evt_live_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_live_session_100',
            payment_intent: 'pi_live_intent_200',
            client_reference_id: '33333333-4444-4555-8666-777777777777',
            metadata: {
              productType: 'amber_alert',
              catId: '123e4567-e89b-42d3-a456-426614174000',
            },
          },
        },
      };
      const rawBody = JSON.stringify(eventPayload);
      const nowSec = Math.floor(Date.now() / 1000);
      const validSig = await hmacSha256Hex(webhookSecret, `${nowSec}.${rawBody}`);

      const res = await stripeWebhookHandler(
        new Request('https://edge.local/stripe-webhook', {
          method: 'POST',
          headers: { 'stripe-signature': `t=${nowSec},v1=${validSig}` },
          body: rawBody,
        })
      );

      assert.strictEqual(res.status, 200);
      assert.ok(rpcCall, 'Expected activate_amber_alert RPC to be invoked');
      assert.strictEqual(rpcCall.fnName, 'activate_amber_alert');
      assert.strictEqual(rpcCall.params.p_cat_id, '123e4567-e89b-42d3-a456-426614174000');
      assert.strictEqual(rpcCall.params.p_user_id, '33333333-4444-4555-8666-777777777777');
      assert.strictEqual(rpcCall.params.p_payment_intent_id, 'pi_live_intent_200');
      assert.strictEqual(rpcCall.params.p_broadcast_radius_meters, 3218.69);
      assert.strictEqual(updatedTransactions.length, 2);
      assert.strictEqual(updatedTransactions[0].payload.status, 'succeeded');
    });
  });

  // ==========================================================================
  // 4. revenuecat-webhook Edge Function
  // ==========================================================================
  describe('4. revenuecat-webhook (Entitlement Sync & HMAC/Bearer Verification)', () => {
    const rcSecret = 'rc_webhook_secret_key_777';
    let profileUpdate = null;
    let transactionInsert = null;

    beforeEach(() => {
      envStore.set('REVENUECAT_WEBHOOK_SECRET', rcSecret);
      profileUpdate = null;
      transactionInsert = null;

      globalThis.__mockCreateClient = () => ({
        from: (table) => {
          if (table === 'profiles') {
            return {
              update: (payload) => ({
                eq: async (col, val) => {
                  profileUpdate = { col, val, payload };
                  return { error: null };
                },
              }),
            };
          }
          if (table === 'payment_transactions') {
            return {
              insert: async (payload) => {
                transactionInsert = payload;
                return { error: null };
              },
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      });
    });

    test('Rejects unauthorized RevenueCat webhook requests with 401', async () => {
      const res = await revenueCatWebhookHandler(
        new Request('https://edge.local/revenuecat-webhook', {
          method: 'POST',
          headers: { Authorization: 'Bearer wrong-secret' },
          body: JSON.stringify({ event: { type: 'INITIAL_PURCHASE' } }),
        })
      );
      assert.strictEqual(res.status, 401);
    });

    test('Processes INITIAL_PURCHASE via X-RevenueCat-Signature HMAC and activates Cat Guardian tier', async () => {
      const userId = '44444444-5555-4666-8777-888888888888';
      const rawBody = JSON.stringify({
        event: {
          id: 'rc_evt_1',
          type: 'INITIAL_PURCHASE',
          app_user_id: userId,
          product_id: 'fmc_guardian_monthly',
          price_in_purchased_currency: 2.99,
          currency: 'GBP',
          expiration_at_ms: Date.now() + 30 * 86400 * 1000,
          transaction_id: 'rc_tx_100',
          entitlement_ids: ['cat_guardian'],
        },
      });
      const sigHex = await hmacSha256Hex(rcSecret, rawBody);

      const res = await revenueCatWebhookHandler(
        new Request('https://edge.local/revenuecat-webhook', {
          method: 'POST',
          headers: { 'x-revenuecat-signature': sigHex },
          body: rawBody,
        })
      );

      assert.strictEqual(res.status, 200);
      assert.strictEqual(profileUpdate.val, userId);
      assert.strictEqual(profileUpdate.payload.is_guardian_subscriber, true);
      assert.strictEqual(profileUpdate.payload.guardian_tier, 'guardian_monthly');
      assert.strictEqual(transactionInsert.amount_pence, 299);
      assert.strictEqual(transactionInsert.status, 'succeeded');
    });

    test('Processes EXPIRATION via Bearer authorization and downgrades profile to free tier', async () => {
      const userId = '44444444-5555-4666-8777-888888888888';
      const rawBody = JSON.stringify({
        event: {
          id: 'rc_evt_2',
          type: 'EXPIRATION',
          app_user_id: userId,
          product_id: 'fmc_guardian_annual',
          entitlement_ids: ['cat_guardian'],
        },
      });

      const res = await revenueCatWebhookHandler(
        new Request('https://edge.local/revenuecat-webhook', {
          method: 'POST',
          headers: { Authorization: `Bearer ${rcSecret}` },
          body: rawBody,
        })
      );

      assert.strictEqual(res.status, 200);
      assert.strictEqual(profileUpdate.payload.is_guardian_subscriber, false);
      assert.strictEqual(profileUpdate.payload.guardian_tier, 'free');
      assert.strictEqual(transactionInsert.product_type, 'cat_guardian_annual');
      assert.strictEqual(transactionInsert.status, 'failed');
    });
  });
});
