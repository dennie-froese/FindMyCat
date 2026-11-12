import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIREBASE_ANALYTICS_CONFIG,
  analyticsService,
  sanitizeAnalyticsParams,
} from '../src/services/analyticsService.ts';
import { revenueCatService } from '../src/services/revenueCatService.ts';
import { stripeService } from '../src/services/stripeService.ts';

describe('Firebase Analytics & User Journey Tracking', () => {
  test('Firebase config enforces UK GDPR & non-advertising privacy flags', () => {
    assert.strictEqual(FIREBASE_ANALYTICS_CONFIG.AD_ID_COLLECTION_ENABLED, false);
    assert.strictEqual(FIREBASE_ANALYTICS_CONFIG.ALLOW_AD_PERSONALIZATION_SIGNALS, false);
    assert.strictEqual(FIREBASE_ANALYTICS_CONFIG.ANONYMIZE_IP, true);
  });

  test('sanitizeAnalyticsParams strips exact GPS coordinates and PII fields', () => {
    const raw = {
      role: 'guardian',
      has_photo: true,
      cat_count: 2,
      latitude: 51.5074,
      longitude: -0.1278,
      exact_location: 'POINT(-0.1278 51.5074)',
      home_location: '51.5074,-0.1278',
      email: 'owner@example.com',
      emergencyPhone: '+447700900077',
      microchipNumber: '985141002384910',
    };

    const clean = sanitizeAnalyticsParams(raw);
    assert.strictEqual(clean.role, 'guardian');
    assert.strictEqual(clean.has_photo, true);
    assert.strictEqual(clean.cat_count, 2);
    assert.strictEqual('latitude' in clean, false);
    assert.strictEqual('longitude' in clean, false);
    assert.strictEqual('exact_location' in clean, false);
    assert.strictEqual('home_location' in clean, false);
    assert.strictEqual('email' in clean, false);
    assert.strictEqual('emergency_phone' in clean, false);
    assert.strictEqual('microchip_number' in clean, false);
  });

  test('User journey tracks screen transitions, previous_screen, and funnel events in order', async () => {
    await analyticsService.resetAnalyticsData();
    await analyticsService.initialize();

    await analyticsService.logScreenView('Onboarding', 'OnboardingScreen');
    await analyticsService.logEvent('onboarding_completed', {
      role: 'guardian',
      has_cat_profile: true,
    });
    await analyticsService.logScreenView('PetPassport', 'PetPassportScreen');
    await analyticsService.logEvent('missing_mode_triggered', {
      cat_id: 'cat-001',
    });
    await analyticsService.logScreenView('LostPosterPreview', 'PosterPreviewScreen');
    await analyticsService.logEvent('poster_generated', {
      cat_id: 'cat-001',
      reward_offered: true,
    });

    const history = await analyticsService.getJourneyHistory();
    assert.strictEqual(history.length, 6);
    assert.strictEqual(history[0].eventName, 'screen_view');
    assert.strictEqual(history[0].screenName, 'Onboarding');
    assert.strictEqual(history[1].eventName, 'onboarding_completed');
    assert.strictEqual(history[2].screenName, 'PetPassport');
    assert.strictEqual(history[2].previousScreen, 'Onboarding');
    assert.strictEqual(history[3].eventName, 'missing_mode_triggered');
    assert.strictEqual(history[4].screenName, 'LostPosterPreview');
    assert.strictEqual(history[4].previousScreen, 'PetPassport');
    assert.strictEqual(history[5].eventName, 'poster_generated');
    assert.strictEqual(history[5].params.reward_offered, true);
  });

  test('Native FirebaseAnalytics bridge receives screen views, events, user ID, and reset', async () => {
    const origFirebase = globalThis.FirebaseAnalytics;
    const capturedEvents = [];
    const capturedScreens = [];
    let boundUserId = null;
    let wasReset = false;

    globalThis.FirebaseAnalytics = {
      setAnalyticsCollectionEnabled: async () => {},
      setUserId: async (uid) => {
        boundUserId = uid;
      },
      setUserProperty: async () => {},
      logScreenView: async (payload) => {
        capturedScreens.push(payload);
      },
      logEvent: async (name, params) => {
        capturedEvents.push({ name, params });
      },
      resetAnalyticsData: async () => {
        wasReset = true;
      },
    };

    try {
      await analyticsService.resetAnalyticsData();
      assert.strictEqual(wasReset, true);

      await analyticsService.setUserId('00000000-0000-4000-8000-000000000999');
      assert.strictEqual(boundUserId, '00000000-0000-4000-8000-000000000999');

      await analyticsService.logScreenView('NeighbourhoodRadar', 'SightingsFeedScreen');
      assert.strictEqual(capturedScreens.length, 1);
      assert.strictEqual(capturedScreens[0].screen_name, 'NeighbourhoodRadar');

      await analyticsService.logEvent('sighting_submitted', {
        has_photo: true,
        latitude: 51.5, // Must be scrubbed before reaching native Firebase
      });
      assert.strictEqual(capturedEvents.length, 1);
      assert.strictEqual(capturedEvents[0].name, 'sighting_submitted');
      assert.strictEqual(capturedEvents[0].params.has_photo, true);
      assert.strictEqual('latitude' in capturedEvents[0].params, false);
    } finally {
      globalThis.FirebaseAnalytics = origFirebase;
    }
  });

  test('RevenueCat and Stripe monetization flows automatically record conversion funnel events', async () => {
    await analyticsService.resetAnalyticsData();

    await revenueCatService.purchaseGuardianSubscription('monthly');
    await stripeService.createAmberAlertPayment({
      catId: 'cat-funnel-1',
      catName: 'Whiskers',
      radiusMiles: 2.0,
    });

    const history = await analyticsService.getJourneyHistory();
    const eventNames = history.map((h) => h.eventName);
    assert.ok(eventNames.includes('subscription_started'), 'Should log subscription_started');
    assert.ok(eventNames.includes('amber_alert_checkout_started'), 'Should log amber_alert_checkout_started');
    assert.ok(eventNames.includes('amber_alert_purchased'), 'Should log amber_alert_purchased');
  });
});
