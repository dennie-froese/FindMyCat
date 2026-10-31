export interface VaccinationRecord {
  id: string;
  name: string;
  administeredDate: string;
  nextDueDate: string;
  vetClinic: string;
  isUpToDate: boolean;
}

export interface CatProfile {
  id: string;
  name: string;
  breed: string;
  gender?: 'Male' | 'Female'; // undefined = not provided by the guardian
  isNeutered?: boolean; // undefined = not provided by the guardian
  ageYears?: number; // undefined = not provided by the guardian
  coatColour: string;
  coatColor?: string; // Compatibility alias
  distinctiveFeatures: string;
  microchipNumber: string; // empty string = no microchip recorded
  photoUrl: string;
  status: 'safe' | 'missing';
  missingSince?: string;
  homeAddressApprox?: string;
  homeCoords?: {
    latitude: number;
    longitude: number;
  };
  vaccinations: VaccinationRecord[];
  medicalNotes?: string;
  emergencyPhone: string;
}

export interface SightingReport {
  id: string;
  catId?: string; // Links to a known registered cat if matched
  catNameHint?: string;
  photoUri: string;
  timestamp: string;
  reportedAtDisplay: string;
  coords: {
    latitude: number;
    longitude: number;
  };
  jitteredCoords: {
    latitude: number;
    longitude: number;
  };
  approximateLocationName: string;
  notes: string;
  coatColour?: string;
  coatColor?: string; // Compatibility alias
  collarDescription?: string;
  isAnonymous: boolean;
  status: 'unverified' | 'investigating' | 'confirmed_match' | 'resolved';
}

export interface CommunityAlert {
  id: string;
  type: 'missing_alert' | 'recent_sighting' | 'tnr_colony';
  title: string;
  subtitle: string;
  petName?: string;
  timeAgo: string;
  distanceMiles: number;
  photoUrl: string;
  status: 'critical' | 'active' | 'safe';
  coords: {
    latitude: number;
    longitude: number;
  };
  badgeText: string;
}

export type MainTab = 'feed' | 'report' | 'passport' | 'poster';

export type UserRole = 'guardian' | 'spotter';

export interface OnboardingState {
  hasCompleted: boolean;
  role?: UserRole;
  completedAt?: string;
}

// ============================================================================
// Monetization & In-App Purchases (RevenueCat + Stripe)
// ============================================================================

export type GuardianTier = 'free' | 'guardian_monthly' | 'guardian_annual';

export interface GuardianSubscriptionStatus {
  isActive: boolean;
  tier: GuardianTier;
  expiresAt?: string;
  originalPurchaseDate?: string;
  willRenew: boolean;
  entitlementId: 'cat_guardian';
  priceDisplay: string; // e.g. '£2.99 / month'
}

export interface GuardianPerk {
  id: string;
  icon: string;
  title: string;
  description: string;
  isUnlockedForFree: boolean;
}

export interface StripeAmberAlertCheckoutParams {
  catId: string;
  catName: string;
  radiusMiles?: number;
  customerEmail?: string;
}

export interface PaymentTransactionRecord {
  id: string;
  productType: 'cat_guardian_monthly' | 'amber_alert_broadcast';
  provider: 'revenuecat' | 'stripe';
  amountPence: number;
  amountDisplay: string;
  currency: 'gbp';
  status: 'pending' | 'succeeded' | 'failed';
  date: string;
  metadata?: Record<string, unknown>;
}


