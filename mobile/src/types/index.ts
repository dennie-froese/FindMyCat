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
  gender: 'Male' | 'Female';
  isNeutered: boolean;
  ageYears: number;
  coatColour: string;
  coatColor?: string; // Compatibility alias
  distinctiveFeatures: string;
  microchipNumber: string;
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
