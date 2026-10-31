import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from './src/theme/colors';
import { CatProfile, SightingReport, CommunityAlert, MainTab, GuardianSubscriptionStatus, UserRole } from './src/types';
import {
  loadCatProfiles,
  saveCatProfiles,
  addCatProfile,
  deleteCatProfile,
  loadSightings,
  saveNewSighting,
  loadCommunityAlerts,
  standDownCatAlerts,
  broadcastCatMissingAlert,
  getOnboardingCompleted,
  setOnboardingCompleted,
} from './src/services/storage';
import { revenueCatService, REVENUECAT_CONFIG } from './src/services/revenueCatService';

import { Header } from './src/components/Header';
import { SightingsFeedScreen } from './src/screens/SightingsFeedScreen';
import { QuickReportScreen } from './src/screens/QuickReportScreen';
import { PetPassportScreen } from './src/screens/PetPassportScreen';
import { PosterPreviewScreen } from './src/screens/PosterPreviewScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { GuardianPaywallModal } from './src/components/GuardianPaywallModal';
import { AddPetModal } from './src/components/AddPetModal';
import { ReunitedCelebrationModal } from './src/components/ReunitedCelebrationModal';
import { RateAppModal } from './src/components/RateAppModal';
import { ratingService, RatingTriggerReason } from './src/services/ratingService';

export default function App() {
  return (
    <SafeAreaProvider>
      <MainAppContent />
    </SafeAreaProvider>
  );
}

function MainAppContent() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<MainTab>('feed');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [addPetModalVisible, setAddPetModalVisible] = useState(false);
  const [rateModalVisible, setRateModalVisible] = useState(false);
  const [ratingTriggerReason, setRatingTriggerReason] = useState<RatingTriggerReason>('manual');
  const [rateModalPetName, setRateModalPetName] = useState<string | undefined>(undefined);

  const [guardianStatus, setGuardianStatus] = useState<GuardianSubscriptionStatus>({
    isActive: false,
    tier: 'free',
    willRenew: false,
    entitlementId: 'cat_guardian',
    priceDisplay: REVENUECAT_CONFIG.MONTHLY_PRICE_DISPLAY,
  });

  const [cats, setCats] = useState<CatProfile[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string>('');
  const [sightings, setSightings] = useState<SightingReport[]>([]);
  const [alerts, setAlerts] = useState<CommunityAlert[]>([]);
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);
  const [reportPrefillHint, setReportPrefillHint] = useState<string | undefined>(undefined);
  const [reunitedCat, setReunitedCat] = useState<CatProfile | null>(null);

  // Initial Data Load & RevenueCat initialization
  useEffect(() => {
    async function initData() {
      try {
        await revenueCatService.initialize();
        const initialStatus = await revenueCatService.getSubscriptionStatus();
        setGuardianStatus(initialStatus);

        const [loadedCats, loadedSightings, loadedAlerts, onboarded] = await Promise.all([
          loadCatProfiles(),
          loadSightings(),
          loadCommunityAlerts(),
          getOnboardingCompleted(),
        ]);
        setCats(loadedCats);
        if (loadedCats.length > 0) {
          setSelectedCatId((prev) => prev || loadedCats[0].id);
        }
        setSightings(loadedSightings);
        setAlerts(loadedAlerts);
        setHasOnboarded(onboarded);
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
      'Thank you! Your anonymous sighting has been logged with the 200m Privacy Shield and added to the neighbourhood radar.',
      [
        {
          text: 'OK',
          onPress: async () => {
            const check = await ratingService.recordSignificantEvent('sighting_reported');
            if (check.shouldPrompt) {
              setRatingTriggerReason('sighting_reported');
              setRateModalVisible(true);
            }
          },
        },
      ]
    );
  };

  const handleUpdateCat = async (updatedCat: CatProfile) => {
    const previousCat = cats.find((c) => c.id === updatedCat.id);
    const updatedCats = cats.map((c) => (c.id === updatedCat.id ? updatedCat : c));
    setCats(updatedCats);
    await saveCatProfiles(updatedCats);

    // If newly marked missing, broadcast 2-mile emergency Amber Alert, switch active cat, and jump to poster tab
    if (updatedCat.status === 'missing') {
      const updatedAlerts = await broadcastCatMissingAlert(updatedCat);
      if (updatedAlerts.length > 0) {
        setAlerts(updatedAlerts);
      }
      setSelectedCatId(updatedCat.id);
      setActiveTab('poster');
    } else if (previousCat && previousCat.status === 'missing' && updatedCat.status === 'safe') {
      // Reunited journey: stand down alerts and trigger celebration modal
      const updatedAlerts = await standDownCatAlerts(updatedCat.name);
      if (updatedAlerts.length > 0) {
        setAlerts(updatedAlerts);
      }
      setReunitedCat(updatedCat);
    }
  };

  const handleAddCat = async (newCat: CatProfile) => {
    const updatedCats = await addCatProfile(newCat);
    setCats(updatedCats);
    setSelectedCatId(newCat.id);
  };

  const handleDeleteCat = async (catId: string) => {
    const catToDelete = cats.find((c) => c.id === catId);
    if (catToDelete && catToDelete.status === 'missing') {
      const updatedAlerts = await standDownCatAlerts(catToDelete.name);
      if (updatedAlerts.length > 0) {
        setAlerts(updatedAlerts);
      }
    }
    const updatedCats = await deleteCatProfile(catId);
    setCats(updatedCats);
    if (selectedCatId === catId) {
      setSelectedCatId(updatedCats.length > 0 ? updatedCats[0].id : '');
    }
  };

  const handleOnboardingComplete = async ({
    createdCat,
    role,
  }: {
    createdCat?: CatProfile;
    role: UserRole;
  }) => {
    await setOnboardingCompleted();
    setHasOnboarded(true);

    if (createdCat) {
      const updatedCats = await addCatProfile(createdCat);
      setCats(updatedCats);
      setSelectedCatId(createdCat.id);
      setActiveTab('passport');
    } else if (role === 'spotter') {
      setActiveTab('feed');
    }
  };

  const activeCat = cats.find((c) => c.id === selectedCatId) || cats[0] || null;
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
          badge: activeCat?.status === 'missing'
            ? 'MISSING'
            : guardianStatus.isActive
            ? 'GUARDIAN MEMBER'
            : 'PROTECTED',
        };
      case 'poster':
        return {
          title: 'Smart Lost Poster',
          subtitle: 'Print-ready vector flyer with dynamic QR code',
          badge: 'ONE-CLICK PDF',
        };
    }
  };

  if (loading || hasOnboarded === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading Find My Cat...</Text>
      </View>
    );
  }

  if (!hasOnboarded) {
    return (
      <>
        <StatusBar style="dark" />
        <OnboardingScreen onComplete={handleOnboardingComplete} />
      </>
    );
  }

  const headerProps = getHeaderProps();
  const criticalAlertsCount = alerts.filter((a) => a.status === 'critical').length;

  const handleHeaderBellPress = () => {
    if (activeTab !== 'feed') {
      setActiveTab('feed');
    }
    Alert.alert(
      criticalAlertsCount > 0 ? '🚨 Active Neighbourhood Alerts' : '🛡️ Neighbourhood Radar',
      criticalAlertsCount > 0
        ? `There ${criticalAlertsCount === 1 ? 'is 1 active missing cat alert' : `are ${criticalAlertsCount} active missing cat alerts`} in your 2-mile radius.`
        : `No emergency missing alerts right now. ${sightings.length} recent ${sightings.length === 1 ? 'sighting' : 'sightings'} logged nearby.`
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        <Header
          title={headerProps.title}
          subtitle={headerProps.subtitle}
          badge={headerProps.badge}
          hasActiveEmergency={isAnyCatMissing || criticalAlertsCount > 0}
          onSearchPress={handleHeaderBellPress}
        />

        <View style={styles.screenContainer}>
          <View style={[styles.tabPane, activeTab !== 'feed' && styles.tabPaneHidden]}>
            <SightingsFeedScreen
              sightings={sightings}
              alerts={alerts}
              onOpenReport={(hint) => {
                setReportPrefillHint(hint);
                setActiveTab('report');
              }}
              onRefresh={handleRefresh}
              refreshing={refreshing}
            />
          </View>

          <View style={[styles.tabPane, activeTab !== 'report' && styles.tabPaneHidden]}>
            <QuickReportScreen
              initialCatHint={reportPrefillHint}
              onSubmitSighting={(report) => {
                setReportPrefillHint(undefined);
                handleNewSighting(report);
              }}
              onCancel={() => {
                setReportPrefillHint(undefined);
                setActiveTab('feed');
              }}
            />
          </View>

          {activeTab === 'passport' && (
            activeCat ? (
              <PetPassportScreen
                cat={activeCat}
                cats={cats}
                selectedCatId={activeCat.id}
                onSelectCat={setSelectedCatId}
                onAddCat={handleAddCat}
                onOpenAddPet={() => setAddPetModalVisible(true)}
                guardianStatus={guardianStatus}
                onUpdateCat={handleUpdateCat}
                onDeleteCat={handleDeleteCat}
                onGeneratePoster={() => setActiveTab('poster')}
                onOpenPaywall={() => setPaywallVisible(true)}
                onOpenRateApp={() => {
                  setRatingTriggerReason('manual');
                  setRateModalPetName(activeCat?.name);
                  setRateModalVisible(true);
                }}
              />
            ) : (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="paw" size={44} color={Colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>No Pet Registered Yet</Text>
                <Text style={styles.emptySubtitle}>
                  Looking out for neighborhood felines? You can also register your own pet anytime to unlock their Digital Health Passport, ISO Microchip vault, and emergency Amber Alert kit.
                </Text>
                <TouchableOpacity
                  style={styles.emptyPrimaryButton}
                  onPress={() => setAddPetModalVisible(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add-circle" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.emptyPrimaryButtonText}>Register Cat Passport</Text>
                </TouchableOpacity>
              </View>
            )
          )}

          {activeTab === 'poster' && (
            activeCat ? (
              <PosterPreviewScreen
                cat={activeCat}
                cats={cats}
                onSelectCat={setSelectedCatId}
                onPosterExported={async () => {
                  const check = await ratingService.recordSignificantEvent('poster_generated');
                  if (check.shouldPrompt) {
                    setRatingTriggerReason('poster_generated');
                    setRateModalPetName(activeCat?.name);
                    setRateModalVisible(true);
                  }
                }}
              />
            ) : (
              <View style={styles.emptyContainer}>
                <View style={[styles.emptyIconCircle, { backgroundColor: '#fee2e2', borderColor: '#fecaca' }]}>
                  <Ionicons name="document-text" size={44} color="#ef4444" />
                </View>
                <Text style={styles.emptyTitle}>No Missing Cat Posters</Text>
                <Text style={styles.emptySubtitle}>
                  Smart viral lost posters equipped with dynamic QR codes are generated when a registered cat is marked as missing in their Passport.
                </Text>
                <TouchableOpacity
                  style={styles.emptyPrimaryButton}
                  onPress={() => setAddPetModalVisible(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add-circle" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.emptyPrimaryButtonText}>Register a Cat First</Text>
                </TouchableOpacity>
              </View>
            )
          )}
        </View>

        {/* Cat Guardian Paywall Modal (RevenueCat StoreKit 2 / Google Play Billing) */}
        <GuardianPaywallModal
          visible={paywallVisible}
          onClose={() => setPaywallVisible(false)}
          onSubscriptionSuccess={(newStatus) => {
            setGuardianStatus(newStatus);
          }}
        />

        {/* Global Add Pet Modal (Available from empty state or switcher) */}
        <AddPetModal
          visible={addPetModalVisible}
          onClose={() => setAddPetModalVisible(false)}
          onSaveCat={(newCat) => {
            setAddPetModalVisible(false);
            handleAddCat(newCat);
          }}
        />

        {/* Celebratory Reunited & Stand-Down Modal */}
        <ReunitedCelebrationModal
          visible={reunitedCat !== null}
          cat={reunitedCat}
          onRateApp={() => {
            const petName = reunitedCat?.name;
            setReunitedCat(null);
            setRatingTriggerReason('reunited');
            setRateModalPetName(petName);
            setRateModalVisible(true);
          }}
          onClose={async () => {
            const petName = reunitedCat?.name;
            setReunitedCat(null);
            const check = await ratingService.recordSignificantEvent('reunited');
            if (check.shouldPrompt) {
              setTimeout(() => {
                setRatingTriggerReason('reunited');
                setRateModalPetName(petName);
                setRateModalVisible(true);
              }, 400);
            }
          }}
        />

        {/* In-App App Store / Google Play Rating Flow Modal */}
        <RateAppModal
          visible={rateModalVisible}
          triggerReason={ratingTriggerReason}
          petName={rateModalPetName}
          onClose={() => setRateModalVisible(false)}
        />


        {/* Bottom Tab Navigation Bar */}
        <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => setActiveTab('feed')}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityLabel="Radar"
            accessibilityState={{ selected: activeTab === 'feed' }}
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
            accessibilityRole="tab"
            accessibilityLabel="Report Sighting"
            accessibilityState={{ selected: activeTab === 'report' }}
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
            accessibilityRole="tab"
            accessibilityLabel="Pet Passport"
            accessibilityState={{ selected: activeTab === 'passport' }}
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
            accessibilityRole="tab"
            accessibilityLabel="Lost Poster"
            accessibilityState={{ selected: activeTab === 'poster' }}
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
  tabPane: {
    flex: 1,
  },
  tabPaneHidden: {
    display: 'none',
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
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: Colors.background,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#fff1ee',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ffded9',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  emptyPrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyPrimaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
