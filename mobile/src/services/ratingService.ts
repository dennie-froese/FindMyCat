import AsyncStorage from '@react-native-async-storage/async-storage';

export type RatingTriggerReason = 'reunited' | 'poster_generated' | 'sighting_reported' | 'manual';

export interface RatingPromptState {
  hasRated: boolean;
  neverAskAgain: boolean;
  promptCount: number;
  lastPromptTimestamp: number | null;
  significantEventsCount: number;
  feedbackSubmitted?: boolean;
}

export interface UserFeedbackEntry {
  id: string;
  rating: number;
  comment: string;
  tag?: string;
  timestamp: string;
}

export const RATING_STORAGE_KEYS = {
  STATE: 'findmycat_rating_state_v1',
  FEEDBACK: 'findmycat_user_feedback_entries_v1',
};

export const RATING_CONFIG = {
  MIN_DAYS_BETWEEN_PROMPTS: 7, // 7 days cooldown between prompts
  MAX_PROMPTS_PER_YEAR: 3,     // Matches Apple SKStoreReviewController 3 times / 365 days guideline
  SIGNIFICANT_EVENTS_THRESHOLD: 2, // Needs at least 2 key actions before asking, unless reunited or manual
  APP_STORE_URL: 'https://apps.apple.com/app/find-my-cat/id6470000000?action=write-review',
  PLAY_STORE_URL: 'market://details?id=com.findmycat.app',
};

const DEFAULT_STATE: RatingPromptState = {
  hasRated: false,
  neverAskAgain: false,
  promptCount: 0,
  lastPromptTimestamp: null,
  significantEventsCount: 0,
  feedbackSubmitted: false,
};

// Resilient Storage Wrapper (supports React Native native bridge, ESM .default, and memory fallback)
const getAsyncStorage = () => {
  if (typeof window === 'undefined' && typeof (globalThis as any).nativeCallSyncHook === 'undefined') {
    const memoryStore = new Map<string, string>();
    return {
      getItem: async (key: string) => memoryStore.get(key) ?? null,
      setItem: async (key: string, value: string) => { memoryStore.set(key, value); },
      removeItem: async (key: string) => { memoryStore.delete(key); },
      clear: async () => { memoryStore.clear(); },
    };
  }
  if (AsyncStorage && typeof (AsyncStorage as any).getItem === 'function') {
    return AsyncStorage;
  }
  if ((AsyncStorage as any)?.default && typeof (AsyncStorage as any).default.getItem === 'function') {
    return (AsyncStorage as any).default;
  }
  const memoryStore = new Map<string, string>();
  return {
    getItem: async (key: string) => memoryStore.get(key) ?? null,
    setItem: async (key: string, value: string) => { memoryStore.set(key, value); },
    removeItem: async (key: string) => { memoryStore.delete(key); },
    clear: async () => { memoryStore.clear(); },
  };
};

const storage = getAsyncStorage();

/**
 * Dynamically loads expo-store-review in React Native / Expo environments.
 * Returns null in Node.js test runners to avoid native module load failures.
 */
async function getStoreReviewModule() {
  if (typeof process !== 'undefined' && process.env?.NODE_TEST_CONTEXT) {
    return null;
  }
  try {
    const mod = await import('expo-store-review');
    return mod;
  } catch {
    return null;
  }
}

/**
 * Dynamically loads react-native Linking & Platform to avoid Flow parser errors in Node.js runners.
 */
async function getReactNativeModule() {
  if (typeof process !== 'undefined' && process.env?.NODE_TEST_CONTEXT) {
    return null;
  }
  try {
    const mod = await import('react-native');
    return mod;
  } catch {
    return null;
  }
}

class RatingService {
  /**
   * Retrieves the current persisted rating flow state.
   */
  async getRatingState(): Promise<RatingPromptState> {
    try {
      const raw = await storage.getItem(RATING_STORAGE_KEYS.STATE);
      if (!raw) return { ...DEFAULT_STATE };
      return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  /**
   * Persists updated rating state.
   */
  private async saveRatingState(state: RatingPromptState): Promise<void> {
    try {
      await storage.setItem(RATING_STORAGE_KEYS.STATE, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to persist rating state:', e);
    }
  }

  /**
   * Evaluates whether the app should present an in-app rating prompt.
   */
  async shouldPromptForRating(trigger: RatingTriggerReason = 'sighting_reported'): Promise<boolean> {
    const state = await this.getRatingState();

    // 1. Manual user trigger (e.g. settings / passport button) is always allowed
    if (trigger === 'manual') {
      return true;
    }

    // 2. Already rated or opted out
    if (state.hasRated || state.neverAskAgain) {
      return false;
    }

    // 3. Frequency ceiling: max prompts per year
    if (state.promptCount >= RATING_CONFIG.MAX_PROMPTS_PER_YEAR) {
      return false;
    }

    // 4. Cooldown period check
    if (state.lastPromptTimestamp) {
      const msSinceLastPrompt = Date.now() - state.lastPromptTimestamp;
      const daysSinceLastPrompt = msSinceLastPrompt / (1000 * 60 * 60 * 24);
      if (daysSinceLastPrompt < RATING_CONFIG.MIN_DAYS_BETWEEN_PROMPTS) {
        return false;
      }
    }

    // 5. High-satisfaction trigger: reunited cat always prompts (if not on cooldown)
    if (trigger === 'reunited') {
      return true;
    }

    // 6. Action threshold check for regular usage
    return state.significantEventsCount >= RATING_CONFIG.SIGNIFICANT_EVENTS_THRESHOLD;
  }

  /**
   * Records a user milestone (sighting submitted, poster printed, cat safely reunited).
   * Automatically updates significant events count and checks if eligible to prompt.
   */
  async recordSignificantEvent(
    event: 'reunited' | 'poster_generated' | 'sighting_reported'
  ): Promise<{ shouldPrompt: boolean; reason: RatingTriggerReason }> {
    const state = await this.getRatingState();
    state.significantEventsCount += 1;
    await this.saveRatingState(state);

    const eligible = await this.shouldPromptForRating(event);
    return {
      shouldPrompt: eligible,
      reason: event,
    };
  }

  /**
   * Marks that a rating prompt has been presented to the user.
   */
  async markPromptShown(): Promise<void> {
    const state = await this.getRatingState();
    state.promptCount += 1;
    state.lastPromptTimestamp = Date.now();
    await this.saveRatingState(state);
  }

  /**
   * Requests official native App Store / Google Play review using expo-store-review.
   * If native review is unsupported (e.g. web or older device), opens the store URL.
   */
  async requestStoreReview(): Promise<{
    success: boolean;
    method: 'native' | 'fallback_url' | 'simulation';
  }> {
    const state = await this.getRatingState();
    state.hasRated = true;
    state.lastPromptTimestamp = Date.now();
    await this.saveRatingState(state);

    const StoreReview = await getStoreReviewModule();

    if (StoreReview) {
      try {
        const isAvailable = await StoreReview.isAvailableAsync();
        if (isAvailable) {
          await StoreReview.requestReview();
          return { success: true, method: 'native' };
        }
      } catch (e) {
        console.warn('Native store review request failed, falling back to URL:', e);
      }
    }

    // Fallback: Open App Store or Google Play write-review link
    const RN = await getReactNativeModule();
    if (RN?.Linking && RN?.Platform) {
      try {
        const targetUrl = RN.Platform.OS === 'ios'
          ? RATING_CONFIG.APP_STORE_URL
          : RATING_CONFIG.PLAY_STORE_URL;
        
        const canOpen = await RN.Linking.canOpenURL(targetUrl);
        if (canOpen) {
          await RN.Linking.openURL(targetUrl);
          return { success: true, method: 'fallback_url' };
        }
      } catch {
        // Simulator / Dev mode graceful handling
      }
    }

    return { success: true, method: 'simulation' };
  }

  /**
   * Saves private constructive feedback from the user when rating <= 3 stars.
   */
  async submitFeedback(rating: number, comment: string, tag?: string): Promise<UserFeedbackEntry> {
    const state = await this.getRatingState();
    state.feedbackSubmitted = true;
    state.lastPromptTimestamp = Date.now();
    await this.saveRatingState(state);

    const entry: UserFeedbackEntry = {
      id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      rating,
      comment: comment.trim(),
      tag,
      timestamp: new Date().toISOString(),
    };

    try {
      const raw = await storage.getItem(RATING_STORAGE_KEYS.FEEDBACK);
      const existing: UserFeedbackEntry[] = raw ? JSON.parse(raw) : [];
      existing.unshift(entry);
      await storage.setItem(RATING_STORAGE_KEYS.FEEDBACK, JSON.stringify(existing));
    } catch (e) {
      console.warn('Failed to store feedback entry:', e);
    }

    return entry;
  }

  /**
   * Postpones the rating prompt (e.g. user selected "Remind me later").
   */
  async postponePrompt(): Promise<void> {
    const state = await this.getRatingState();
    state.lastPromptTimestamp = Date.now();
    await this.saveRatingState(state);
  }

  /**
   * Dismisses the prompt and opts out of future automated prompts.
   */
  async dismissNeverAskAgain(): Promise<void> {
    const state = await this.getRatingState();
    state.neverAskAgain = true;
    state.lastPromptTimestamp = Date.now();
    await this.saveRatingState(state);
  }

  /**
   * Clears state for testing and development.
   */
  async resetRatingState(): Promise<void> {
    await storage.removeItem(RATING_STORAGE_KEYS.STATE);
    await storage.removeItem(RATING_STORAGE_KEYS.FEEDBACK);
  }
}

export const ratingService = new RatingService();
