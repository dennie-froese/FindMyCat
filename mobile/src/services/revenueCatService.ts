// ============================================================================
// Find My Cat — RevenueCat Service (StoreKit 2 & Google Play Billing)
// Product: "Cat Guardian" Subscription (£2.99 / month)
// Free tier note: RevenueCat is free up to $2,500/mo tracked revenue.
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GuardianSubscriptionStatus, GuardianPerk } from '../types/index.ts';

const getPlatformOS = (): 'ios' | 'android' | 'web' => {
  try {
    // @ts-ignore
    if (typeof globalThis !== 'undefined' && globalThis.Platform?.OS) {
      // @ts-ignore
      return globalThis.Platform.OS;
    }
  } catch {}
  return 'ios';
};

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

  // Pricing
  MONTHLY_PRICE_GBP: 2.99,
  MONTHLY_PRICE_DISPLAY: '£2.99 / month',
  ANNUAL_PRICE_GBP: 29.99,
  ANNUAL_PRICE_DISPLAY: '£29.99 / year (Save 16%)',

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
    if (this.isInitialized) return;

    try {
      const os = getPlatformOS();
      const apiKey = os === 'ios' ? REVENUECAT_CONFIG.APPLE_KEY : REVENUECAT_CONFIG.GOOGLE_KEY;

      // Check if native Purchases module is available in custom dev build / production
      // @ts-ignore
      const PurchasesModule = global?.Purchases || null;

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
      this.isInitialized = true;
    } catch (err) {
      console.warn('[RevenueCat] Initialization warning:', err);
      await this.loadCachedStatus();
      this.isInitialized = true;
    }
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

  /**
   * Purchases the £2.99 / month "Cat Guardian" subscription.
   * Handles StoreKit 2 on iOS and Google Play Billing on Android.
   */
  public async purchaseGuardianSubscription(
    plan: 'monthly' | 'annual' = 'monthly'
  ): Promise<{ success: boolean; status: GuardianSubscriptionStatus; message: string }> {
    try {
      // In production with native Purchases module:
      // @ts-ignore
      const PurchasesModule = global?.Purchases;

      if (PurchasesModule && typeof PurchasesModule.purchasePackage === 'function') {
        const productId =
          plan === 'monthly'
            ? REVENUECAT_CONFIG.PRODUCT_ID_MONTHLY
            : REVENUECAT_CONFIG.PRODUCT_ID_ANNUAL;

        const { customerInfo } = await PurchasesModule.purchaseProduct(productId);
        const isActive = !!customerInfo?.entitlements?.active[REVENUECAT_CONFIG.ENTITLEMENT_ID];

        this.currentStatus = {
          isActive,
          tier: plan === 'monthly' ? 'guardian_monthly' : 'guardian_annual',
          expiresAt: customerInfo?.entitlements?.active[REVENUECAT_CONFIG.ENTITLEMENT_ID]?.expirationDate,
          originalPurchaseDate: new Date().toISOString(),
          willRenew: true,
          entitlementId: 'cat_guardian',
          priceDisplay: plan === 'monthly' ? REVENUECAT_CONFIG.MONTHLY_PRICE_DISPLAY : REVENUECAT_CONFIG.ANNUAL_PRICE_DISPLAY,
        };

        await this.persistStatus();
        return {
          success: true,
          status: this.currentStatus,
          message: 'Welcome to Cat Guardian! Your feline protection vault is now fully active.',
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
      // @ts-ignore
      const PurchasesModule = global?.Purchases;
      if (PurchasesModule && typeof PurchasesModule.restorePurchases === 'function') {
        const customerInfo = await PurchasesModule.restorePurchases();
        const isActive = !!customerInfo?.entitlements?.active[REVENUECAT_CONFIG.ENTITLEMENT_ID];

        this.currentStatus.isActive = isActive;
        this.currentStatus.tier = isActive ? 'guardian_monthly' : 'free';
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
   * Resets subscription for testing / sign-out purposes.
   */
  public async cancelSubscriptionForTest(): Promise<GuardianSubscriptionStatus> {
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
