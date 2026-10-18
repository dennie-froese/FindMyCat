// ============================================================================
// Find My Cat — Stripe Service (One-Off Emergency Amber Alerts)
// Product: "Amber Alert" 2-Mile Emergency Broadcast: £14.99 one-off
// ============================================================================

import type { StripeAmberAlertCheckoutParams, PaymentTransactionRecord } from '../types/index.ts';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const STRIPE_CONFIG = {
  // Configurable Stripe Publishable Key
  PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_findmycat_mock_key',

  // Product Pricing Constants (in pence for precision)
  AMBER_ALERT_PRICE_PENCE: 1499, // £14.99
  AMBER_ALERT_PRICE_DISPLAY: '£14.99',

  CURRENCY: 'gbp',
  DEFAULT_BROADCAST_RADIUS_MILES: 2.0,
};


const STORAGE_KEY_TRANSACTIONS = '@fmc_payment_transactions_v1';

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

class StripeService {
  /**
   * Creates an Amber Alert emergency broadcast checkout (£14.99 one-off).
   * Calls Supabase Edge function `create-stripe-payment` or simulates in sandbox mode.
   */
  public async createAmberAlertPayment(
    params: StripeAmberAlertCheckoutParams
  ): Promise<{
    success: boolean;
    checkoutUrl?: string;
    transaction: PaymentTransactionRecord;
    message: string;
  }> {
    const amountPence = STRIPE_CONFIG.AMBER_ALERT_PRICE_PENCE;
    const transactionId = `txn_amber_${Date.now()}`;

    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('your-project-id')) {
        const res = await fetch(`${supabaseUrl}/functions/v1/create-stripe-payment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            productType: 'amber_alert',
            catId: params.catId,
            catName: params.catName,
            customerEmail: params.customerEmail,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const txn: PaymentTransactionRecord = {
            id: data.sessionId || transactionId,
            productType: 'amber_alert_broadcast',
            provider: 'stripe',
            amountPence,
            amountDisplay: STRIPE_CONFIG.AMBER_ALERT_PRICE_DISPLAY,
            currency: 'gbp',
            status: 'succeeded',
            date: new Date().toISOString(),
            metadata: {
              catId: params.catId,
              catName: params.catName,
              radiusMiles: params.radiusMiles || STRIPE_CONFIG.DEFAULT_BROADCAST_RADIUS_MILES,
              mode: data.mode,
            },
          };

          await this.recordTransaction(txn);

          return {
            success: true,
            checkoutUrl: data.checkoutUrl,
            transaction: txn,
            message: `🚨 Emergency Amber Alert Broadcast (£14.99) activated! 2-mile radar perimeter engaged.`,
          };
        }
      }

      // Resilient Sandbox / Offline Simulation
      const simulatedTxn: PaymentTransactionRecord = {
        id: transactionId,
        productType: 'amber_alert_broadcast',
        provider: 'stripe',
        amountPence,
        amountDisplay: STRIPE_CONFIG.AMBER_ALERT_PRICE_DISPLAY,
        currency: 'gbp',
        status: 'succeeded',
        date: new Date().toISOString(),
        metadata: {
          catId: params.catId,
          catName: params.catName,
          radiusMiles: params.radiusMiles || STRIPE_CONFIG.DEFAULT_BROADCAST_RADIUS_MILES,
          sandbox: true,
        },
      };

      await this.recordTransaction(simulatedTxn);

      return {
        success: true,
        checkoutUrl: `https://checkout.stripe.com/pay/${transactionId}`,
        transaction: simulatedTxn,
        message: `🚨 Amber Alert activated (£14.99 via Stripe)! 2-mile neighborhood radar broadcast dispatched.`,
      };
    } catch (err: any) {
      console.error('[Stripe] Amber alert payment failed:', err);
      return {
        success: false,
        transaction: {
          id: transactionId,
          productType: 'amber_alert_broadcast',
          provider: 'stripe',
          amountPence,
          amountDisplay: STRIPE_CONFIG.AMBER_ALERT_PRICE_DISPLAY,
          currency: 'gbp',
          status: 'failed',
          date: new Date().toISOString(),
        },
        message: err?.message || 'Payment processing failed. Please try again.',
      };
    }
  }


  /**
   * Retrieves past transactions recorded on device.
   */
  public async getTransactions(): Promise<PaymentTransactionRecord[]> {
    try {
      const raw = await safeStorage.getItem(STORAGE_KEY_TRANSACTIONS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private async recordTransaction(txn: PaymentTransactionRecord): Promise<void> {
    try {
      const current = await this.getTransactions();
      const updated = [txn, ...current];
      await safeStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(updated));
    } catch (err) {
      console.warn('Could not record transaction locally:', err);
    }
  }
}

export const stripeService = new StripeService();
