// ============================================================================
// Find My Cat — RevenueCat Service (StoreKit 2 & Google Play Billing)
// Product: "Cat Guardian" Subscription (£2.99 / month)
// Free tier note: RevenueCat is free up to $2,500/mo tracked revenue.
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GuardianSubscriptionStatus, GuardianPerk } from '../types/index.ts';
import { analyticsService } from './analyticsService.ts';

const getPlatformOS = (): 'ios' | 'android' | 'web' => {
  try {
    // @ts-ignore
    if (typeof globalThis !== 'undefined' && globalThis.Platform?.OS) {
      // @ts-ignore
      return globalThis.Platform.OS;
    }
    if (typeof process === 'undefined' || !process.env?.NODE_TEST_CONTEXT) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const rn = require('react-native');
      if (rn?.Platform?.OS) {
        return rn.Platform.OS;
      }
    }
  } catch {}
  return 'ios';
};

/**
 * Resolves the native RevenueCat Purchases module (`react-native-purchases`) when running
 * inside a compiled iOS/Android binary, or `global.Purchases` in test harnesses.
 * Safely returns null in Node.js test runners, web, or Expo Go without native bindings.
 */
function getPurchasesModule(): any {
  try {
    // @ts-ignore
    if (typeof globalThis !== 'undefined' && globalThis.Purchases) {
      // @ts-ignore
      return globalThis.Purchases;
    }
    if (typeof process !== 'undefined' && process.env?.NODE_TEST_CONTEXT) {
      return null;
    }
    if (getPlatformOS() === 'web') {
      return null;
    }
    // Dynamic require so missing native binary in Expo Go / Node does not crash bundle evaluation
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-purchases');
    return mod?.default ?? mod ?? null;
  } catch {
    return null;
  }
}

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
};

export const REVENUECAT_CONFIG = {
  // Public SDK Keys (Configurable via mobile/.env)
  APPLE_KEY: process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY || 'appl_findmycat_mock_key',
  GOOGLE_KEY: process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY || 'goog_findmycat_mock_key',

  // Entitlement & Product IDs
  ENTITLEMENT_ID: 'cat_guardian',
  PRODUCT_ID_MONTHLY: 'fmc_cat_guardian_monthly_299',
  PRODUCT_ID_ANNUAL: 'fmc_cat_guardian_annual_2999',
  PRODUCT_ID_AMBER_ALERT: 'fmc_amber_alert_boost_1499',

  // Pricing
  MONTHLY_PRICE_GBP: 2.99,
  MONTHLY_PRICE_DISPLAY: '£2.99 / month',
  ANNUAL_PRICE_GBP: 29.99,
  ANNUAL_PRICE_DISPLAY: '£29.99 / year (Save 16%)',
  AMBER_ALERT_PRICE_GBP: 14.99,
  AMBER_ALERT_PRICE_DISPLAY: '£14.99',

  // RevenueCat Free Tier Cap
  FREE_TIER_TRACKED_REVENUE_CAP_USD: 2500,
};

const STORAGE_KEY_GUARDIAN = '@fmc_guardian_subscription_v1';

export const GUARDIAN_PERKS: GuardianPerk[] = [
  {
    id: 'perk-vault',
    icon: 'shield-checkmark',
    title: 'Digital Health Vault & Booster Reminders',
    description: 'Unlimited vaccine schedules, microchip tracking, and automatic SMS reminders 7 days before vet boosters.',
    isUnlockedForFree: false,
  },
  {
    id: 'perk-radar',
    icon: 'radio',
    title: 'Priority Radar Lookout Pushes',
    description: 'Instant notification dispatch when someone reports a sighting matching your cat’s coat pattern within 3 miles.',
    isUnlockedForFree: false,
  },
  {
    id: 'perk-multi',
    icon: 'paw',
    title: 'Multi-Cat Passport Profiles',
    description: 'Register unlimited cats under one guardian account with ISO 11784 microchip verification.',
    isUnlockedForFree: false,
  },
  {
    id: 'perk-flyer',
    icon: 'document-text',
    title: 'Zero-Fee Smart PDF Lost Posters',
    description: 'One-click high-contrast A4 print flyer generation with dynamic embedded QR codes linking spotters directly to you.',
    isUnlockedForFree: true,
  },
  {
    id: 'perk-cloud-backup',
    icon: 'cloud-done',
    title: 'Encrypted Cloud Backup & Medical Export',
    description: 'Real-time cloud synchronization and 1-tap exportable health records for vet consultations.',
    isUnlockedForFree: false,
  },
];

class RevenueCatService {
  private isInitialized = false;
  private currentStatus: GuardianSubscriptionStatus = {
    isActive: false,
    tier: 'free',
    willRenew: false,
    entitlementId: 'cat_guardian',
    priceDisplay: REVENUECAT_CONFIG.MONTHLY_PRICE_DISPLAY,
  };

  /**
   * Initializes RevenueCat with platform-specific API keys for StoreKit 2 and Google Play Billing.
   * Gracefully falls back to mock/sandbox mode if running in Expo Go or simulator.
   */
  public async initialize(userId?: string): Promise<void> {
    if (this.isInitialized) {
      if (userId) {
        await this.identifyUser(userId);
      }
      return;
    }

    try {
      const os = getPlatformOS();
      const apiKey = os === 'ios' ? REVENUECAT_CONFIG.APPLE_KEY : REVENUECAT_CONFIG.GOOGLE_KEY;

      // Check if native Purchases module is available in custom dev build / production
      const PurchasesModule = getPurchasesModule();

      if (PurchasesModule && typeof PurchasesModule.configure === 'function') {
        PurchasesModule.configure({
          apiKey,
          appUserID: userId || null,
        });
        console.log(`[RevenueCat] Native SDK configured with ${os} key.`);
      } else {
        console.log('[RevenueCat] Operating in resilient mock/sandbox mode (Expo / Dev environment).');
      }

      // Load cached subscription state
      await this.loadCachedStatus();

      // If native SDK supports getCustomerInfo, sync live StoreKit 2 entitlement state
      if (PurchasesModule && typeof PurchasesModule.getCustomerInfo === 'function') {
        try {
          const customerInfo = await PurchasesModule.getCustomerInfo();
          this.applyCustomerInfo(customerInfo);
          await this.persistStatus();
        } catch {}
      }

      this.isInitialized = true;
    } catch (err) {
      console.warn('[RevenueCat] Initialization warning:', err);
      await this.loadCachedStatus();
      this.isInitialized = true;
    }
  }

  /**
   * Binds the authenticated Supabase user UUID to RevenueCat (`app_user_id`) so
   * `revenuecat-webhook` updates the matching row in `public.profiles`.
   */
  public async identifyUser(userId: string): Promise<void> {
    if (!userId || !userId.trim()) return;
    try {
      const PurchasesModule = getPurchasesModule();
      if (PurchasesModule && typeof PurchasesModule.logIn === 'function') {
        const result = await PurchasesModule.logIn(userId.trim());
        const customerInfo = result?.customerInfo ?? result;
        if (customerInfo?.entitlements) {
          this.applyCustomerInfo(customerInfo);
          await this.persistStatus();
        }
      }
    } catch (err) {
      console.warn('[RevenueCat] identifyUser warning:', err);
    }
  }

  private applyCustomerInfo(customerInfo: any, fallbackPlan: 'monthly' | 'annual' = 'monthly'): boolean {
    const activeEntitlement = customerInfo?.entitlements?.active?.[REVENUECAT_CONFIG.ENTITLEMENT_ID];
    const isActive = Boolean(activeEntitlement);
    const productIdentifier = String(activeEntitlement?.productIdentifier || '');
    const isAnnual =
      productIdentifier.toLowerCase().includes('annual') || fallbackPlan === 'annual';

    this.currentStatus = {
      isActive,
      tier: isActive ? (isAnnual ? 'guardian_annual' : 'guardian_monthly') : 'free',
      expiresAt: activeEntitlement?.expirationDate || undefined,
      originalPurchaseDate:
        activeEntitlement?.originalPurchaseDate || (isActive ? new Date().toISOString() : undefined),
      willRenew: Boolean(activeEntitlement?.willRenew ?? isActive),
      entitlementId: 'cat_guardian',
      priceDisplay: isAnnual
        ? REVENUECAT_CONFIG.ANNUAL_PRICE_DISPLAY
        : REVENUECAT_CONFIG.MONTHLY_PRICE_DISPLAY,
    };
    return isActive;
  }

  /**
   * Retrieves the current Guardian subscription status.
   */
  public async getSubscriptionStatus(): Promise<GuardianSubscriptionStatus> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this.currentStatus;
  }

  private isSandboxEnvironment(): boolean {
    const os = getPlatformOS();
    const apiKey = os === 'ios' ? REVENUECAT_CONFIG.APPLE_KEY : REVENUECAT_CONFIG.GOOGLE_KEY;
    return (
      apiKey.includes('mock_key') ||
      process.env.EXPO_PUBLIC_DEMO_MODE === 'true' ||
      Boolean(process.env.NODE_TEST_CONTEXT)
    );
  }

  /**
   * Purchases the £2.99 / month "Cat Guardian" subscription.
   * Handles StoreKit 2 on iOS and Google Play Billing on Android.
   */
  public async purchaseGuardianSubscription(
    plan: 'monthly' | 'annual' = 'monthly'
  ): Promise<{ success: boolean; status: GuardianSubscriptionStatus; message: string }> {
    try {
      // In production with native Purchases module:
      const PurchasesModule = getPurchasesModule();

      if (
        PurchasesModule &&
        (typeof PurchasesModule.purchaseProduct === 'function' ||
          typeof PurchasesModule.purchaseStoreProduct === 'function' ||
          typeof PurchasesModule.purchasePackage === 'function')
      ) {
        const productId =
          plan === 'monthly'
            ? REVENUECAT_CONFIG.PRODUCT_ID_MONTHLY
            : REVENUECAT_CONFIG.PRODUCT_ID_ANNUAL;

        let customerInfo: any = null;

        if (typeof PurchasesModule.getOfferings === 'function' && typeof PurchasesModule.purchasePackage === 'function') {
          try {
            const offerings = await PurchasesModule.getOfferings();
            const availablePackages: any[] = offerings?.current?.availablePackages || [];
            const matchedPkg = availablePackages.find(
              (pkg) =>
                pkg?.product?.identifier === productId ||
                pkg?.identifier === (plan === 'annual' ? '$rc_annual' : '$rc_monthly')
            );
            if (matchedPkg) {
              const res = await PurchasesModule.purchasePackage(matchedPkg);
              customerInfo = res?.customerInfo ?? res;
            }
          } catch {}
        }

        if (!customerInfo) {
          if (
            typeof PurchasesModule.getProducts === 'function' &&
            typeof PurchasesModule.purchaseStoreProduct === 'function'
          ) {
            try {
              const storeProducts = await PurchasesModule.getProducts([productId]);
              if (Array.isArray(storeProducts) && storeProducts.length > 0) {
                const res = await PurchasesModule.purchaseStoreProduct(storeProducts[0]);
                customerInfo = res?.customerInfo ?? res;
              }
            } catch {}
          }
        }

        if (!customerInfo && typeof PurchasesModule.purchaseProduct === 'function') {
          const res = await PurchasesModule.purchaseProduct(productId);
          customerInfo = res?.customerInfo ?? res;
        }

        const isActive = this.applyCustomerInfo(customerInfo, plan);

        await this.persistStatus();
        if (isActive) {
          await analyticsService.logEvent('subscription_started', {
            plan,
            currency: 'GBP',
            value:
              plan === 'annual'
                ? REVENUECAT_CONFIG.ANNUAL_PRICE_GBP
                : REVENUECAT_CONFIG.MONTHLY_PRICE_GBP,
          });
        }
        return {
          success: isActive,
          status: this.currentStatus,
          message: isActive
            ? 'Welcome to Cat Guardian! Your feline protection vault is now fully active.'
            : 'Purchase was not completed or entitlement could not be verified.',
        };
      }

      if (!this.isSandboxEnvironment()) {
        return {
          success: false,
          status: this.currentStatus,
          message: 'In-app purchases are unavailable on this device. Please ensure App Store / Google Play billing is enabled.',
        };
      }

      // Sandbox / Demo Simulation for immediate preview and testing
      const expires = new Date();
      if (plan === 'monthly') {
        expires.setMonth(expires.getMonth() + 1);
      } else {
        expires.setFullYear(expires.getFullYear() + 1);
      }

      this.currentStatus = {
        isActive: true,
        tier: plan === 'monthly' ? 'guardian_monthly' : 'guardian_annual',
        expiresAt: expires.toISOString(),
        originalPurchaseDate: new Date().toISOString(),
        willRenew: true,
        entitlementId: 'cat_guardian',
        priceDisplay: plan === 'monthly' ? REVENUECAT_CONFIG.MONTHLY_PRICE_DISPLAY : REVENUECAT_CONFIG.ANNUAL_PRICE_DISPLAY,
      };

      await this.persistStatus();
      await analyticsService.logEvent('subscription_started', {
        plan,
        currency: 'GBP',
        value:
          plan === 'annual'
            ? REVENUECAT_CONFIG.ANNUAL_PRICE_GBP
            : REVENUECAT_CONFIG.MONTHLY_PRICE_GBP,
      });

      return {
        success: true,
        status: this.currentStatus,
        message: '🎉 Subscription activated! Welcome to Cat Guardian (£2.99/mo).',
      };
    } catch (err: any) {
      console.error('[RevenueCat] Purchase failed:', err);
      return {
        success: false,
        status: this.currentStatus,
        message: err?.message || 'Unable to complete in-app purchase. Please try again.',
      };
    }
  }

  /**
   * Restores existing StoreKit 2 / Google Play purchases.
   */
  public async restorePurchases(): Promise<{
    restored: boolean;
    status: GuardianSubscriptionStatus;
    message: string;
  }> {
    try {
      // In production:
      const PurchasesModule = getPurchasesModule();
      if (PurchasesModule && typeof PurchasesModule.restorePurchases === 'function') {
        const customerInfo = await PurchasesModule.restorePurchases();
        const isActive = this.applyCustomerInfo(customerInfo);
        await this.persistStatus();

        return {
          restored: isActive,
          status: this.currentStatus,
          message: isActive
            ? 'Your Cat Guardian subscription has been restored!'
            : 'No active Cat Guardian subscriptions found for this App Store / Google Play account.',
        };
      }

      // Sandbox fallback check
      const cached = await safeStorage.getItem(STORAGE_KEY_GUARDIAN);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.isActive) {
          this.currentStatus = parsed;
          return {
            restored: true,
            status: this.currentStatus,
            message: 'Active Cat Guardian subscription restored.',
          };
        }
      }

      return {
        restored: false,
        status: this.currentStatus,
        message: 'No active subscriptions found for this account.',
      };
    } catch (err: any) {
      return {
        restored: false,
        status: this.currentStatus,
        message: err?.message || 'Failed to restore purchases.',
      };
    }
  }

  /**
   * Purchases the one-off £14.99 Emergency Amber Alert Boost via StoreKit 2 / RevenueCat on iOS.
   * Satisfies Apple App Store Review Guideline 3.1.1 for in-app digital radar boosts.
   */
  public async purchaseAmberAlertBoost(
    catId: string
  ): Promise<{ success: boolean; transactionId?: string; message: string }> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const PurchasesModule = getPurchasesModule();
      const productId = REVENUECAT_CONFIG.PRODUCT_ID_AMBER_ALERT;

      if (PurchasesModule) {
        if (typeof PurchasesModule.setAttributes === 'function' && catId) {
          try {
            await PurchasesModule.setAttributes({ cat_id: catId });
          } catch {}
        }

        let purchaseResult: any = null;

        if (
          typeof PurchasesModule.getProducts === 'function' &&
          typeof PurchasesModule.purchaseStoreProduct === 'function'
        ) {
          try {
            const products = await PurchasesModule.getProducts([productId]);
            if (Array.isArray(products) && products.length > 0) {
              purchaseResult = await PurchasesModule.purchaseStoreProduct(products[0]);
            }
          } catch {}
        }

        if (!purchaseResult && typeof PurchasesModule.purchaseProduct === 'function') {
          purchaseResult = await PurchasesModule.purchaseProduct(productId);
        }

        if (purchaseResult) {
          const txId =
            purchaseResult?.transaction?.transactionIdentifier ||
            purchaseResult?.customerInfo?.nonSubscriptionTransactions?.[0]?.transactionIdentifier ||
            `rc_amber_${Date.now()}`;
          await analyticsService.logEvent('amber_alert_purchased', {
            provider: 'storekit2',
            currency: 'GBP',
            value: REVENUECAT_CONFIG.AMBER_ALERT_PRICE_GBP,
          });
          return {
            success: true,
            transactionId: txId,
            message: '2-Mile Emergency Amber Alert Boost activated via App Store.',
          };
        }
      }

      if (!this.isSandboxEnvironment()) {
        return {
          success: false,
          message: 'App Store in-app purchases are currently unavailable on this device.',
        };
      }

      await analyticsService.logEvent('amber_alert_purchased', {
        provider: 'storekit2_sandbox',
        currency: 'GBP',
        value: REVENUECAT_CONFIG.AMBER_ALERT_PRICE_GBP,
      });
      return {
        success: true,
        transactionId: `rc_sandbox_amber_${Date.now()}`,
        message: '2-Mile Emergency Amber Alert Boost activated (Sandbox).',
      };
    } catch (err: any) {
      if (err?.userCancelled) {
        return {
          success: false,
          message: 'Purchase cancelled.',
        };
      }
      return {
        success: false,
        message: err?.message || 'Unable to complete App Store purchase. Please try again.',
      };
    }
  }

  /**
   * Resets subscription for testing / sign-out purposes and logs out of RevenueCat.
   */
  public async cancelSubscriptionForTest(): Promise<GuardianSubscriptionStatus> {
    try {
      const PurchasesModule = getPurchasesModule();
      if (PurchasesModule && typeof PurchasesModule.logOut === 'function') {
        await PurchasesModule.logOut();
      }
    } catch {}

    this.currentStatus = {
      isActive: false,
      tier: 'free',
      willRenew: false,
      entitlementId: 'cat_guardian',
      priceDisplay: REVENUECAT_CONFIG.MONTHLY_PRICE_DISPLAY,
    };
    await this.persistStatus();
    return this.currentStatus;
  }

  private async loadCachedStatus(): Promise<void> {
    try {
      const cached = await safeStorage.getItem(STORAGE_KEY_GUARDIAN);
      if (cached) {
        this.currentStatus = JSON.parse(cached);
      }
    } catch (e) {
      console.warn('Failed to read cached subscription:', e);
    }
  }

  private async persistStatus(): Promise<void> {
    try {
      await safeStorage.setItem(STORAGE_KEY_GUARDIAN, JSON.stringify(this.currentStatus));
    } catch (e) {
      console.error('Failed to save subscription:', e);
    }
  }
}

export const revenueCatService = new RevenueCatService();
