import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from './src/theme/colors';
import { CatProfile, SightingReport, CommunityAlert, MainTab } from './src/types';
import {
  loadCatProfiles,
  saveCatProfiles,
  loadSightings,
  saveNewSighting,
  loadCommunityAlerts,
} from './src/services/storage';

import { Header } from './src/components/Header';
import { SightingsFeedScreen } from './src/screens/SightingsFeedScreen';
import { QuickReportScreen } from './src/screens/QuickReportScreen';
import { PetPassportScreen } from './src/screens/PetPassportScreen';
import { PosterPreviewScreen } from './src/screens/PosterPreviewScreen';

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTab>('feed');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [cats, setCats] = useState<CatProfile[]>([]);
  const [sightings, setSightings] = useState<SightingReport[]>([]);
  const [alerts, setAlerts] = useState<CommunityAlert[]>([]);

  // Initial Data Load
  useEffect(() => {
    async function initData() {
      try {
        const [loadedCats, loadedSightings, loadedAlerts] = await Promise.all([
          loadCatProfiles(),
          loadSightings(),
          loadCommunityAlerts(),
        ]);
        setCats(loadedCats);
        setSightings(loadedSightings);
        setAlerts(loadedAlerts);
      } catch (e) {
        console.error('Initialization error:', e);
      } finally {
        setLoading(false);
      }
    }
    initData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const [loadedCats, loadedSightings, loadedAlerts] = await Promise.all([
        loadCatProfiles(),
        loadSightings(),
        loadCommunityAlerts(),
      ]);
      setCats(loadedCats);
      setSightings(loadedSightings);
      setAlerts(loadedAlerts);
    } finally {
      setRefreshing(false);
    }
  };

  const handleNewSighting = async (newReport: SightingReport) => {
    const updated = await saveNewSighting(newReport);
    setSightings(updated);
    setActiveTab('feed');
    Alert.alert(
      '🎉 Sighting Broadcasted!',
      'Thank you! Your anonymous sighting has been logged with the 200m Privacy Shield and added to the neighbourhood radar.'
    );
  };

  const handleUpdateCat = async (updatedCat: CatProfile) => {
    const updatedCats = cats.map((c) => (c.id === updatedCat.id ? updatedCat : c));
    setCats(updatedCats);
    await saveCatProfiles(updatedCats);

    // If marked missing, jump to poster tab
    if (updatedCat.status === 'missing') {
      setActiveTab('poster');
    }
  };

  const activeCat = cats[0] || null;
  const isAnyCatMissing = cats.some((c) => c.status === 'missing');

  const getHeaderProps = () => {
    switch (activeTab) {
      case 'feed':
        return {
          title: 'Neighbourhood Radar',
          subtitle: 'Real-time felines, sightings & local colonies',
          badge: isAnyCatMissing ? '🚨 MISSING ALERT ACTIVE' : 'LIVE RADAR',
        };
      case 'report':
        return {
          title: 'Report a Sighting',
          subtitle: 'Instant camera capture • Zero registration',
          badge: 'ANONYMOUS SPOTTER',
        };
      case 'passport':
        return {
          title: 'Digital Pet Passport',
          subtitle: `${activeCat ? activeCat.name : 'Pet'}’s health vault & microchip records`,
          badge: activeCat?.status === 'missing' ? 'MISSING' : 'PROTECTED',
        };
      case 'poster':
        return {
          title: 'Smart Lost Poster',
          subtitle: 'Print-ready vector flyer with dynamic QR code',
          badge: 'ONE-CLICK PDF',
        };
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading Find My Cat...</Text>
      </View>
    );
  }

  const headerProps = getHeaderProps();

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        <Header
          title={headerProps.title}
          subtitle={headerProps.subtitle}
          badge={headerProps.badge}
        />

        <View style={styles.screenContainer}>
          {activeTab === 'feed' && (
            <SightingsFeedScreen
              sightings={sightings}
              alerts={alerts}
              onOpenReport={() => setActiveTab('report')}
              onRefresh={handleRefresh}
              refreshing={refreshing}
            />
          )}

          {activeTab === 'report' && (
            <QuickReportScreen
              onSubmitSighting={handleNewSighting}
              onCancel={() => setActiveTab('feed')}
            />
          )}

          {activeTab === 'passport' && activeCat && (
            <PetPassportScreen
              cat={activeCat}
              onUpdateCat={handleUpdateCat}
              onGeneratePoster={() => setActiveTab('poster')}
            />
          )}

          {activeTab === 'poster' && activeCat && (
            <PosterPreviewScreen cat={activeCat} />
          )}
        </View>

        {/* Bottom Tab Navigation Bar */}
        <View style={styles.bottomNav}>
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => setActiveTab('feed')}
            activeOpacity={0.7}
          >
            <Ionicons
              name={activeTab === 'feed' ? 'paw' : 'paw-outline'}
              size={22}
              color={activeTab === 'feed' ? Colors.primary : Colors.textMuted}
            />
            <Text
              style={[styles.navLabel, activeTab === 'feed' && styles.navLabelActive]}
            >
              Radar
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navItemSpecial}
            onPress={() => setActiveTab('report')}
            activeOpacity={0.85}
          >
            <View
              style={[
                styles.specialIconBadge,
                activeTab === 'report' && styles.specialIconBadgeActive,
              ]}
            >
              <Ionicons name="camera" size={24} color="#ffffff" />
            </View>
            <Text
              style={[
                styles.navLabelSpecial,
                activeTab === 'report' && styles.navLabelActive,
              ]}
            >
              Report
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navItem}
            onPress={() => setActiveTab('passport')}
            activeOpacity={0.7}
          >
            <Ionicons
              name={activeTab === 'passport' ? 'shield-checkmark' : 'shield-checkmark-outline'}
              size={22}
              color={activeTab === 'passport' ? Colors.primary : Colors.textMuted}
            />
            <Text
              style={[
                styles.navLabel,
                activeTab === 'passport' && styles.navLabelActive,
              ]}
            >
              Passport
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navItem}
            onPress={() => setActiveTab('poster')}
            activeOpacity={0.7}
          >
            <Ionicons
              name={activeTab === 'poster' ? 'document-text' : 'document-text-outline'}
              size={22}
              color={activeTab === 'poster' ? Colors.primary : Colors.textMuted}
            />
            <Text
              style={[
                styles.navLabel,
                activeTab === 'poster' && styles.navLabelActive,
              ]}
            >
              Poster
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  screenContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingVertical: 6,
    paddingBottom: 20,
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingTop: 4,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 3,
  },
  navLabelActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  navItemSpecial: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginTop: -18,
  },
  specialIconBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 7,
    elevation: 6,
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  specialIconBadgeActive: {
    backgroundColor: Colors.primaryHover,
    transform: [{ scale: 1.05 }],
  },
  navLabelSpecial: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    marginTop: 4,
  },
});
