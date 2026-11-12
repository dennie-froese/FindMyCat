// ============================================================================
// Find My Cat — Firebase Analytics Service (GA4 & User Journey Tracking)
// Free Tier: Unlimited events (up to 500 distinct event names) on Spark Plan.
// Privacy: Strict UK GDPR & Apple ATT compliance (NSPrivacyTracking = false,
//          AD_ID disabled, zero PII / zero exact GPS coordinates logged).
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

export type AnalyticsEventName =
  | 'screen_view'
  | 'app_initialized'
  | 'onboarding_step_viewed'
  | 'onboarding_completed'
  | 'cat_passport_created'
  | 'cat_passport_updated'
  | 'cat_passport_deleted'
  | 'sighting_submitted'
  | 'missing_mode_triggered'
  | 'cat_reunited'
  | 'poster_generated'
  | 'paywall_viewed'
  | 'subscription_started'
  | 'purchases_restored'
  | 'amber_alert_checkout_started'
  | 'amber_alert_purchased'
  | 'rate_app_prompted'
  | 'account_erased';

export interface JourneyStepRecord {
  stepIndex: number;
  eventName: string;
  screenName: string;
  previousScreen: string | null;
  params: Record<string, string | number | boolean>;
  timestamp: string;
}

export const FIREBASE_ANALYTICS_CONFIG = {
  MEASUREMENT_ID: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-FINDMYCAT01',
  FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:000000000000:ios:findmycat',
  AD_ID_COLLECTION_ENABLED: false,
  ALLOW_AD_PERSONALIZATION_SIGNALS: false,
  ANONYMIZE_IP: true,
  MAX_JOURNEY_BREADCRUMBS: 100,
  MAX_PARAM_VALUE_LENGTH: 100,
};

const STORAGE_KEY_JOURNEY = '@fmc_analytics_journey_v1';
const STORAGE_KEY_OPT_OUT = '@fmc_analytics_opt_out_v1';

/**
 * Sensitive keys that must NEVER be transmitted to Firebase Analytics / GA4
 * to uphold Find My Cat's 200m Geodesic Privacy Shield and UK GDPR policy.
 */
const FORBIDDEN_PII_AND_LOCATION_KEYS = new Set([
  'latitude',
  'longitude',
  'lat',
  'lng',
  'lon',
  'exact_location',
  'exactlocation',
  'home_location',
  'homelocation',
  'coordinates',
  'gps',
  'email',
  'customeremail',
  'customer_email',
  'phone',
  'emergencyphone',
  'emergency_phone',
  'ownerphone',
  'owner_phone',
  'contact',
  'microchip',
  'microchipnumber',
  'microchip_number',
  'homeaddressapprox',
  'home_address_approx',
]);

const memoryStore = new Map<string, string>();

const safeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (AsyncStorage && typeof AsyncStorage.getItem === 'function') {
        return await AsyncStorage.getItem(key);
      }
    } catch {}
    return memoryStore.get(key) || null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (AsyncStorage && typeof AsyncStorage.setItem === 'function') {
        await AsyncStorage.setItem(key, value);
        return;
      }
    } catch {}
    memoryStore.set(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      if (AsyncStorage && typeof AsyncStorage.removeItem === 'function') {
        await AsyncStorage.removeItem(key);
      }
    } catch {}
    memoryStore.delete(key);
  },
};

/**
 * Resolves the native `@react-native-firebase/analytics` instance when running
 * inside a compiled iOS/Android binary, or `globalThis.FirebaseAnalytics` in test harnesses.
 * Safely returns null in Node.js test runners, web, or Expo Go without native bindings.
 */
function getNativeFirebaseAnalytics(): any {
  try {
    // @ts-ignore
    if (typeof globalThis !== 'undefined' && globalThis.FirebaseAnalytics) {
      // @ts-ignore
      return globalThis.FirebaseAnalytics;
    }
    if (typeof process !== 'undefined' && process.env?.NODE_TEST_CONTEXT) {
      return null;
    }
    // Dynamic require so missing native binary in Expo Go / Node does not crash bundle evaluation
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-firebase/analytics');
    const factory = mod?.default ?? mod;
    return typeof factory === 'function' ? factory() : factory ?? null;
  } catch {
    return null;
  }
}

/**
 * Sanitizes event parameters to strip any accidental PII or exact GPS coordinates
 * and enforces Firebase Analytics (GA4) parameter naming and length limits.
 */
export function sanitizeAnalyticsParams(
  rawParams?: Record<string, unknown>
): Record<string, string | number | boolean> {
  if (!rawParams || typeof rawParams !== 'object') {
    return {};
  }

  const sanitized: Record<string, string | number | boolean> = {};

  for (const [rawKey, rawValue] of Object.entries(rawParams)) {
    if (rawValue === undefined || rawValue === null) continue;

    const normalizedKey = rawKey
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .slice(0, 40);

    if (!normalizedKey) continue;

    const collapsedKey = normalizedKey.replace(/_/g, '');
    if (
      FORBIDDEN_PII_AND_LOCATION_KEYS.has(normalizedKey) ||
      FORBIDDEN_PII_AND_LOCATION_KEYS.has(collapsedKey)
    ) {
      continue;
    }

    if (typeof rawValue === 'boolean') {
      sanitized[normalizedKey] = rawValue;
    } else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      sanitized[normalizedKey] = rawValue;
    } else if (typeof rawValue === 'string') {
      sanitized[normalizedKey] = rawValue.slice(0, FIREBASE_ANALYTICS_CONFIG.MAX_PARAM_VALUE_LENGTH);
    }
  }

  return sanitized;
}

class AnalyticsService {
  private initialized = false;
  private collectionEnabled = true;
  private currentScreen = 'AppLaunch';
  private previousScreen: string | null = null;
  private stepCounter = 0;
  private journeyLog: JourneyStepRecord[] = [];

  /**
   * Initializes Firebase Analytics with privacy-first defaults.
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    const optOutFlag = await safeStorage.getItem(STORAGE_KEY_OPT_OUT);
    this.collectionEnabled = optOutFlag !== 'true';

    const cachedJourney = await safeStorage.getItem(STORAGE_KEY_JOURNEY);
    if (cachedJourney) {
      try {
        const parsed = JSON.parse(cachedJourney);
        if (Array.isArray(parsed)) {
          this.journeyLog = parsed.slice(-FIREBASE_ANALYTICS_CONFIG.MAX_JOURNEY_BREADCRUMBS);
          this.stepCounter =
            this.journeyLog.length > 0
              ? this.journeyLog[this.journeyLog.length - 1].stepIndex
              : 0;
        }
      } catch {}
    }

    const nativeAnalytics = getNativeFirebaseAnalytics();
    if (nativeAnalytics && typeof nativeAnalytics.setAnalyticsCollectionEnabled === 'function') {
      try {
        await nativeAnalytics.setAnalyticsCollectionEnabled(this.collectionEnabled);
      } catch (err) {
        console.warn('[Analytics] Native initialization warning:', err);
      }
    }

    this.initialized = true;
  }

  /**
   * Enables or disables Firebase Analytics collection (UK GDPR opt-out control).
   */
  public async setAnalyticsCollectionEnabled(enabled: boolean): Promise<void> {
    this.collectionEnabled = enabled;
    await safeStorage.setItem(STORAGE_KEY_OPT_OUT, enabled ? 'false' : 'true');

    const nativeAnalytics = getNativeFirebaseAnalytics();
    if (nativeAnalytics && typeof nativeAnalytics.setAnalyticsCollectionEnabled === 'function') {
      try {
        await nativeAnalytics.setAnalyticsCollectionEnabled(enabled);
      } catch (err) {
        console.warn('[Analytics] setAnalyticsCollectionEnabled warning:', err);
      }
    }
  }

  /**
   * Binds the anonymous Supabase UUID to Firebase Analytics (never an email or name).
   */
  public async setUserId(anonymousUserId: string | null): Promise<void> {
    if (!this.collectionEnabled) return;

    const nativeAnalytics = getNativeFirebaseAnalytics();
    if (nativeAnalytics && typeof nativeAnalytics.setUserId === 'function') {
      try {
        await nativeAnalytics.setUserId(anonymousUserId);
      } catch (err) {
        console.warn('[Analytics] setUserId warning:', err);
      }
    }
  }

  /**
   * Sets a non-PII user property (e.g. `user_role: 'guardian' | 'spotter'`, `guardian_tier`).
   */
  public async setUserProperty(name: string, value: string | null): Promise<void> {
    if (!this.collectionEnabled) return;
    const cleanKey = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 24);
    if (FORBIDDEN_PII_AND_LOCATION_KEYS.has(cleanKey)) return;

    const nativeAnalytics = getNativeFirebaseAnalytics();
    if (nativeAnalytics && typeof nativeAnalytics.setUserProperty === 'function') {
      try {
        await nativeAnalytics.setUserProperty(
          cleanKey,
          value ? value.slice(0, 36) : null
        );
      } catch (err) {
        console.warn('[Analytics] setUserProperty warning:', err);
      }
    }
  }

  /**
   * Logs a screen transition for Firebase GA4 Path Exploration & Journey trees.
   */
  public async logScreenView(
    screenName: string,
    screenClass: string = screenName
  ): Promise<JourneyStepRecord | null> {
    if (!this.initialized) {
      await this.initialize();
    }
    if (!this.collectionEnabled) return null;

    if (screenName !== this.currentScreen) {
      this.previousScreen = this.currentScreen;
      this.currentScreen = screenName;
    }

    const nativeAnalytics = getNativeFirebaseAnalytics();
    if (nativeAnalytics && typeof nativeAnalytics.logScreenView === 'function') {
      try {
        await nativeAnalytics.logScreenView({
          screen_name: screenName,
          screen_class: screenClass,
        });
      } catch (err) {
        console.warn('[Analytics] logScreenView warning:', err);
      }
    }

    return this.recordJourneyStep('screen_view', {
      screen_name: screenName,
      screen_class: screenClass,
      previous_screen: this.previousScreen || 'none',
    });
  }

  /**
   * Logs a custom product or funnel event with automatic PII & GPS coordinate scrubbing.
   */
  public async logEvent(
    eventName: AnalyticsEventName | string,
    params?: Record<string, unknown>
  ): Promise<JourneyStepRecord | null> {
    if (!this.initialized) {
      await this.initialize();
    }
    if (!this.collectionEnabled) return null;

    const cleanEventName = eventName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .slice(0, 40);

    const sanitizedParams = sanitizeAnalyticsParams({
      ...params,
      screen_name: this.currentScreen,
      previous_screen: this.previousScreen || 'none',
    });

    const nativeAnalytics = getNativeFirebaseAnalytics();
    if (nativeAnalytics && typeof nativeAnalytics.logEvent === 'function') {
      try {
        await nativeAnalytics.logEvent(cleanEventName, sanitizedParams);
      } catch (err) {
        console.warn('[Analytics] logEvent warning:', err);
      }
    }

    // Web gtag bridge if running inside Expo Web
    try {
      // @ts-ignore
      if (typeof globalThis !== 'undefined' && typeof globalThis.gtag === 'function') {
        // @ts-ignore
        globalThis.gtag('event', cleanEventName, sanitizedParams);
      }
    } catch {}

    return this.recordJourneyStep(cleanEventName, sanitizedParams);
  }

  /**
   * Returns the ordered list of user journey steps recorded on device.
   */
  public async getJourneyHistory(): Promise<JourneyStepRecord[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    return [...this.journeyLog];
  }

  /**
   * Clears all analytics data on account deletion (UK GDPR Right to Erasure).
   */
  public async resetAnalyticsData(): Promise<void> {
    this.journeyLog = [];
    this.stepCounter = 0;
    this.previousScreen = null;
    this.currentScreen = 'AppLaunch';
    await safeStorage.removeItem(STORAGE_KEY_JOURNEY);

    const nativeAnalytics = getNativeFirebaseAnalytics();
    if (nativeAnalytics && typeof nativeAnalytics.resetAnalyticsData === 'function') {
      try {
        await nativeAnalytics.resetAnalyticsData();
      } catch (err) {
        console.warn('[Analytics] resetAnalyticsData warning:', err);
      }
    }
  }

  private async recordJourneyStep(
    eventName: string,
    params: Record<string, string | number | boolean>
  ): Promise<JourneyStepRecord> {
    this.stepCounter += 1;
    const record: JourneyStepRecord = {
      stepIndex: this.stepCounter,
      eventName,
      screenName: this.currentScreen,
      previousScreen: this.previousScreen,
      params,
      timestamp: new Date().toISOString(),
    };

    this.journeyLog.push(record);
    if (this.journeyLog.length > FIREBASE_ANALYTICS_CONFIG.MAX_JOURNEY_BREADCRUMBS) {
      this.journeyLog = this.journeyLog.slice(-FIREBASE_ANALYTICS_CONFIG.MAX_JOURNEY_BREADCRUMBS);
    }

    await safeStorage.setItem(STORAGE_KEY_JOURNEY, JSON.stringify(this.journeyLog));
    return record;
  }
}

export const analyticsService = new AnalyticsService();
