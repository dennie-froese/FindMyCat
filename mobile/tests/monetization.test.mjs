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
});


