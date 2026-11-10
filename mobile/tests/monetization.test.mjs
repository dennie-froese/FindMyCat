import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  REVENUECAT_CONFIG,
  GUARDIAN_PERKS,
  revenueCatService,
} from '../src/services/revenueCatService.ts';
import {
  STRIPE_CONFIG,
  stripeService,
} from '../src/services/stripeService.ts';

describe('Monetization: RevenueCat (StoreKit 2 & Google Play Billing)', () => {
  test('RevenueCat config matches business model requirements', () => {
    assert.strictEqual(REVENUECAT_CONFIG.ENTITLEMENT_ID, 'cat_guardian');
    assert.strictEqual(REVENUECAT_CONFIG.MONTHLY_PRICE_GBP, 2.99);
    assert.strictEqual(REVENUECAT_CONFIG.MONTHLY_PRICE_DISPLAY, '£2.99 / month');
    assert.strictEqual(REVENUECAT_CONFIG.FREE_TIER_TRACKED_REVENUE_CAP_USD, 2500);
  });

  test('Cat Guardian perks cover all required premium features', () => {
    const perkIds = GUARDIAN_PERKS.map((p) => p.id);
    assert.ok(perkIds.includes('perk-vault'), 'Must include digital health vault');
    assert.ok(perkIds.includes('perk-radar'), 'Must include priority radar lookout');
    assert.ok(perkIds.includes('perk-multi'), 'Must include multi-cat passport profiles');
    assert.ok(perkIds.includes('perk-cloud-backup'), 'Must include encrypted cloud backup');

    // Lost flyer is free for all
    const flyerPerk = GUARDIAN_PERKS.find((p) => p.id === 'perk-flyer');
    assert.strictEqual(flyerPerk?.isUnlockedForFree, true);
  });

  test('RevenueCat purchase activates guardian entitlement', async () => {
    // Reset status first
    await revenueCatService.cancelSubscriptionForTest();
    let status = await revenueCatService.getSubscriptionStatus();
    assert.strictEqual(status.isActive, false);

    // Purchase monthly subscription (£2.99/mo)
    const result = await revenueCatService.purchaseGuardianSubscription('monthly');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status.isActive, true);
    assert.strictEqual(result.status.tier, 'guardian_monthly');
    assert.strictEqual(result.status.entitlementId, 'cat_guardian');
    assert.strictEqual(result.status.priceDisplay, '£2.99 / month');
    assert.ok(result.status.expiresAt, 'Should have an expiration date');

    // Confirm cached retrieval works
    status = await revenueCatService.getSubscriptionStatus();
    assert.strictEqual(status.isActive, true);
  });

  test('RevenueCat restore purchases functions reliably', async () => {
    const restoreResult = await revenueCatService.restorePurchases();
    assert.strictEqual(typeof restoreResult.restored, 'boolean');
    assert.ok(restoreResult.message);
  });

  test('RevenueCat identifyUser binds Supabase UUID and syncs native customerInfo entitlement', async () => {
    const origPurchases = globalThis.Purchases;
    let loggedInUserId = null;

    globalThis.Purchases = {
      logIn: async (uid) => {
        loggedInUserId = uid;
        return {
          customerInfo: {
            entitlements: {
              active: {
                cat_guardian: {
                  productIdentifier: 'fmc_cat_guardian_annual_2999',
                  expirationDate: '2027-11-10T00:00:00Z',
                  willRenew: true,
                },
              },
            },
          },
        };
      },
    };

    try {
      await revenueCatService.identifyUser('00000000-0000-4000-8000-000000000123');
      assert.strictEqual(loggedInUserId, '00000000-0000-4000-8000-000000000123');
      const status = await revenueCatService.getSubscriptionStatus();
      assert.strictEqual(status.isActive, true);
      assert.strictEqual(status.tier, 'guardian_annual');
    } finally {
      globalThis.Purchases = origPurchases;
    }
  });

  test('RevenueCat purchaseAmberAlertBoost purchases £14.99 iOS StoreKit 2 boost and cancelSubscriptionForTest calls logOut', async () => {
    const origPurchases = globalThis.Purchases;
    let purchasedProductId = null;
    let assignedCatAttr = null;
    let loggedOut = false;

    globalThis.Purchases = {
      setAttributes: async (attrs) => {
        assignedCatAttr = attrs.cat_id;
      },
      getProducts: async (ids) => ids.map((id) => ({ identifier: id, price: 14.99 })),
      purchaseStoreProduct: async (product) => {
        purchasedProductId = product.identifier;
        return {
          transaction: { transactionIdentifier: 'storekit2_amber_tx_001' },
        };
      },
      logOut: async () => {
        loggedOut = true;
      },
    };

    try {
      const catId = '123e4567-e89b-42d3-a456-426614174000';
      const boostRes = await revenueCatService.purchaseAmberAlertBoost(catId);
      assert.strictEqual(boostRes.success, true);
      assert.strictEqual(boostRes.transactionId, 'storekit2_amber_tx_001');
      assert.strictEqual(purchasedProductId, REVENUECAT_CONFIG.PRODUCT_ID_AMBER_ALERT);
      assert.strictEqual(assignedCatAttr, catId);

      const resetStatus = await revenueCatService.cancelSubscriptionForTest();
      assert.strictEqual(resetStatus.isActive, false);
      assert.strictEqual(loggedOut, true);
    } finally {
      globalThis.Purchases = origPurchases;
    }
  });
});

describe('Monetization: Stripe (One-Off Emergency Amber Alerts)', () => {
  test('Stripe configuration enforces £14.99 Amber Alert price', () => {
    assert.strictEqual(STRIPE_CONFIG.AMBER_ALERT_PRICE_PENCE, 1499);
    assert.strictEqual(STRIPE_CONFIG.AMBER_ALERT_PRICE_DISPLAY, '£14.99');
    assert.strictEqual(STRIPE_CONFIG.DEFAULT_BROADCAST_RADIUS_MILES, 2.0);
    assert.strictEqual(STRIPE_CONFIG.CURRENCY, 'gbp');
  });

  test('Stripe Amber Alert payment triggers 2-mile emergency broadcast', async () => {
    const amberParams = {
      catId: 'test-cat-mochi',
      catName: 'Mochi',
      radiusMiles: 2.0,
      customerEmail: 'mochi.owner@example.com',
    };

    const paymentResult = await stripeService.createAmberAlertPayment(amberParams);

    assert.strictEqual(paymentResult.success, true);
    assert.strictEqual(paymentResult.transaction.amountPence, 1499);
    assert.strictEqual(paymentResult.transaction.amountDisplay, '£14.99');
    assert.strictEqual(paymentResult.transaction.currency, 'gbp');
    assert.strictEqual(paymentResult.transaction.productType, 'amber_alert_broadcast');
    assert.strictEqual(paymentResult.transaction.provider, 'stripe');
    assert.strictEqual(paymentResult.transaction.status, 'succeeded');
    assert.strictEqual(paymentResult.transaction.metadata?.catId, 'test-cat-mochi');
    assert.strictEqual(paymentResult.transaction.metadata?.radiusMiles, 2.0);
  });

  test('Live Stripe Checkout session sets pending status and requiresBrowserCheckout', async () => {
    const origUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const origKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    const origFetch = globalThis.fetch;

    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          mode: 'stripe_live',
          sessionId: 'cs_live_123',
          checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_live_123',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    try {
      const res = await stripeService.createAmberAlertPayment({
        catId: 'test-cat-mochi',
        catName: 'Mochi',
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.requiresBrowserCheckout, true);
      assert.strictEqual(res.transaction.status, 'pending');
      assert.strictEqual(res.checkoutUrl, 'https://checkout.stripe.com/c/pay/cs_live_123');
    } finally {
      process.env.EXPO_PUBLIC_SUPABASE_URL = origUrl;
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = origKey;
      globalThis.fetch = origFetch;
    }
  });

  test('Stripe Edge Function HTTP error fails closed instead of granting simulated success', async () => {
    const origUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const origKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    const origFetch = globalThis.fetch;

    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'Stripe gateway unavailable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });

    try {
      const res = await stripeService.createAmberAlertPayment({
        catId: 'test-cat-mochi',
        catName: 'Mochi',
      });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.transaction.status, 'failed');
      assert.match(res.message, /Stripe gateway unavailable/i);
    } finally {
      process.env.EXPO_PUBLIC_SUPABASE_URL = origUrl;
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = origKey;
      globalThis.fetch = origFetch;
    }
  });
});


