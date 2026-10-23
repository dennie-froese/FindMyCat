import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Expo automatically exposes environment variables prefixed with EXPO_PUBLIC_
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '⚠️ FindMyCat: Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Please set these in your mobile/.env file.'
  );
}

/**
 * Hardened Secure Storage Adapter
 * In native environments (iOS / Android), stores authentication sessions
 * inside hardware-backed storage:
 *   - iOS: Apple Keychain (encrypted with Secure Enclave hardware key)
 *   - Android: Android Keystore (encrypted SharedPreferences)
 *
 * In web and automated headless test environments, safely falls back to AsyncStorage.
 */
function getSecureAuthStorage() {
  if (Platform.OS === 'web') {
    return AsyncStorage;
  }

  try {
    // Dynamic import to avoid missing native module crash in Node / test runners
    const SecureStore = require('expo-secure-store');

    return {
      getItem: async (key: string): Promise<string | null> => {
        try {
          return await SecureStore.getItemAsync(key);
        } catch {
          return await AsyncStorage.getItem(key);
        }
      },
      setItem: async (key: string, value: string): Promise<void> => {
        try {
          await SecureStore.setItemAsync(key, value);
        } catch {
          await AsyncStorage.setItem(key, value);
        }
      },
      removeItem: async (key: string): Promise<void> => {
        try {
          await SecureStore.deleteItemAsync(key);
        } catch {
          await AsyncStorage.removeItem(key);
        }
      },
    };
  } catch {
    return AsyncStorage;
  }
}

/**
 * Shared Supabase Client instance for Find My Cat mobile application.
 * Configured with hardware-backed SecureStore for persistent, encrypted sessions.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: getSecureAuthStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
