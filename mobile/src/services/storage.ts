import AsyncStorage from '@react-native-async-storage/async-storage';
import { CatProfile, SightingReport, CommunityAlert } from '../types';

const STORAGE_KEYS = {
  CATS: '@fmc_cats_v1',
  SIGHTINGS: '@fmc_sightings_v1',
  ALERTS: '@fmc_alerts_v1',
};

const SEED_CATS: CatProfile[] = [
  {
    id: 'cat-1',
    name: 'Mochi',
    breed: 'British Shorthair / Ginger Tabby',
    gender: 'Male',
    isNeutered: true,
    ageYears: 3,
    coatColour: 'Warm Ginger with White Bib & Paws',
    distinctiveFeatures: 'Small nick on left ear tip, green eyes, distinct white chest patch',
    microchipNumber: '985141002345678',
    photoUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&auto=format&fit=crop&q=80',
    status: 'safe',
    emergencyPhone: '+44 7700 900123',
    homeAddressApprox: 'Near Victoria Park / St. Mark’s Gate',
    homeCoords: {
      latitude: 51.5362,
      longitude: -0.0385,
    },
    medicalNotes: 'Slightly shy around dogs. Hypoallergenic dry food diet.',
    vaccinations: [
      {
        id: 'vac-1',
        name: 'Cat Flu & Enteritis (Core Booster)',
        administeredDate: '2026-03-15',
        nextDueDate: '2027-03-15',
        vetClinic: 'Victoria Park Vets',
        isUpToDate: true,
      },
      {
        id: 'vac-2',
        name: 'FeLV (Feline Leukaemia Vaccine)',
        administeredDate: '2025-09-10',
        nextDueDate: '2026-09-10',
        vetClinic: 'Victoria Park Vets',
        isUpToDate: false,
      },
      {
        id: 'vac-3',
        name: 'Annual Microchip Check & Health Screen',
        administeredDate: '2026-03-15',
        nextDueDate: '2027-03-15',
        vetClinic: 'Victoria Park Vets',
        isUpToDate: true,
      },
    ],
  },
  {
    id: 'cat-2',
    name: 'Luna',
    breed: 'Domestic Shorthair / Tuxedo',
    gender: 'Female',
    isNeutered: true,
    ageYears: 2,
    coatColour: 'Sleek Black with White Moustache & Paws',
    distinctiveFeatures: 'Distinct asymmetrical white moustache, golden-amber eyes',
    microchipNumber: '985141009876543',
    photoUrl: 'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=600&auto=format&fit=crop&q=80',
    status: 'safe',
    emergencyPhone: '+44 7700 900123',
    homeAddressApprox: 'Near Victoria Park / St. Mark’s Gate',
    homeCoords: {
      latitude: 51.5362,
      longitude: -0.0385,
    },
    medicalNotes: 'Very playful. Up to date on all preventive treatments.',
    vaccinations: [
      {
        id: 'vac-luna-1',
        name: 'Cat Flu & Enteritis (Core Booster)',
        administeredDate: '2026-01-20',
        nextDueDate: '2027-01-20',
        vetClinic: 'Victoria Park Vets',
        isUpToDate: true,
      },
      {
        id: 'vac-luna-2',
        name: 'Rabies & Travel Health Certificate',
        administeredDate: '2025-11-05',
        nextDueDate: '2026-11-05',
        vetClinic: 'Victoria Park Vets',
        isUpToDate: true,
      },
    ],
  },
];

const SEED_SIGHTINGS: SightingReport[] = [
  {
    id: 'sight-1',
    catId: 'cat-1',
    catNameHint: 'Looks like Mochi',
    photoUri: 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=600&auto=format&fit=crop&q=80',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    reportedAtDisplay: '2 hours ago',
    coords: {
      latitude: 51.5375,
      longitude: -0.0392,
    },
    jitteredCoords: {
      latitude: 51.5385,
      longitude: -0.0401,
    },
    approximateLocationName: 'Behind Pavilion Cafe, hedge line',
    notes: 'Resting quietly under shrubbery. Unharmed, wearing blue breakaway collar.',
    coatColour: 'Ginger Tabby',
    collarDescription: 'Blue collar with reflective bell',
    isAnonymous: true,
    status: 'investigating',
  },
  {
    id: 'sight-2',
    photoUri: 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&auto=format&fit=crop&q=80',
    timestamp: new Date(Date.now() - 3600000 * 14).toISOString(),
    reportedAtDisplay: '14 hours ago',
    coords: {
      latitude: 51.5342,
      longitude: -0.0351,
    },
    jitteredCoords: {
      latitude: 51.5351,
      longitude: -0.0362,
    },
    approximateLocationName: 'Gore Road residential alleyway',
    notes: 'Calico domestic shorthair observed near garden fence.',
    coatColour: 'Calico / Tortie & White',
    isAnonymous: true,
    status: 'unverified',
  },
];

const SEED_ALERTS: CommunityAlert[] = [
  {
    id: 'alert-1',
    type: 'missing_alert',
    title: 'Missing: Oliver (Tuxedo)',
    subtitle: 'Escaped 48h ago near Lauriston Rd. Very skittish.',
    petName: 'Oliver',
    timeAgo: 'Yesterday',
    distanceMiles: 0.3,
    photoUrl: 'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=600&auto=format&fit=crop&q=80',
    status: 'critical',
    coords: { latitude: 51.538, longitude: -0.037 },
    badgeText: 'URGENT ALERT',
  },
  {
    id: 'alert-2',
    type: 'recent_sighting',
    title: 'Possible Match for Mochi',
    subtitle: 'Spotted near Pavilion Cafe hedge line. Safe & resting.',
    petName: 'Mochi',
    timeAgo: '2h ago',
    distanceMiles: 0.1,
    photoUrl: 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=600&auto=format&fit=crop&q=80',
    status: 'active',
    coords: { latitude: 51.5385, longitude: -0.0401 },
    badgeText: 'NEW SIGHTING',
  },
  {
    id: 'alert-3',
    type: 'tnr_colony',
    title: 'Canal Basin Caregiver Colony',
    subtitle: '4 registered ear-tipped community cats under daily care.',
    timeAgo: 'Monitored daily',
    distanceMiles: 0.5,
    photoUrl: 'https://images.unsplash.com/photo-1561948955-570b270e7c36?w=600&auto=format&fit=crop&q=80',
    status: 'safe',
    coords: { latitude: 51.532, longitude: -0.042 },
    badgeText: 'TNR SAFE ZONE',
  },
];

export async function loadCatProfiles(): Promise<CatProfile[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CATS);
    if (!raw) {
      await AsyncStorage.setItem(STORAGE_KEYS.CATS, JSON.stringify(SEED_CATS));
      return SEED_CATS;
    }
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to load cats:', error);
    return SEED_CATS;
  }
}

export async function saveCatProfiles(cats: CatProfile[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.CATS, JSON.stringify(cats));
  } catch (error) {
    console.error('Failed to save cats:', error);
  }
}

export async function addCatProfile(newCat: CatProfile): Promise<CatProfile[]> {
  try {
    const current = await loadCatProfiles();
    const updated = [...current, newCat];
    await saveCatProfiles(updated);
    return updated;
  } catch (error) {
    console.error('Failed to add cat profile:', error);
    return [];
  }
}

export async function deleteCatProfile(catId: string): Promise<CatProfile[]> {
  try {
    const current = await loadCatProfiles();
    const updated = current.filter((c) => c.id !== catId);
    await saveCatProfiles(updated);
    return updated;
  } catch (error) {
    console.error('Failed to delete cat profile:', error);
    return [];
  }
}

export async function loadSightings(): Promise<SightingReport[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.SIGHTINGS);
    if (!raw) {
      await AsyncStorage.setItem(STORAGE_KEYS.SIGHTINGS, JSON.stringify(SEED_SIGHTINGS));
      return SEED_SIGHTINGS;
    }
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to load sightings:', error);
    return SEED_SIGHTINGS;
  }
}

export async function saveNewSighting(report: SightingReport): Promise<SightingReport[]> {
  try {
    const current = await loadSightings();
    const updated = [report, ...current];
    await AsyncStorage.setItem(STORAGE_KEYS.SIGHTINGS, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error('Failed to save sighting:', error);
    return [];
  }
}

export async function loadCommunityAlerts(): Promise<CommunityAlert[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.ALERTS);
    if (!raw) {
      await AsyncStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(SEED_ALERTS));
      return SEED_ALERTS;
    }
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to load alerts:', error);
    return SEED_ALERTS;
  }
}
