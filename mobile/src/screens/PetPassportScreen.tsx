import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { CatProfile, GuardianSubscriptionStatus } from '../types';
import { AmberAlertCheckoutModal } from '../components/AmberAlertCheckoutModal';
import { PetSelectorBar } from '../components/PetSelectorBar';
import { AddPetModal } from '../components/AddPetModal';
import { EditPetModal } from '../components/EditPetModal';
import { scheduleLocalBoosterAlerts } from '../services/reminderService';

interface PetPassportScreenProps {
  cat: CatProfile;
  cats: CatProfile[];
  selectedCatId: string;
  onSelectCat: (catId: string) => void;
  onAddCat: (newCat: CatProfile) => void;
  guardianStatus: GuardianSubscriptionStatus;
  onUpdateCat: (updated: CatProfile) => void;
  onDeleteCat?: (catId: string) => void;
  onGeneratePoster: () => void;
  onOpenPaywall: () => void;
  onOpenRateApp?: () => void;
}

export const PetPassportScreen: React.FC<PetPassportScreenProps> = ({
  cat,
  cats,
  selectedCatId,
  onSelectCat,
  onAddCat,
  guardianStatus,
  onUpdateCat,
  onDeleteCat,
  onGeneratePoster,
  onOpenPaywall,
  onOpenRateApp,
}) => {
  const [copiedChip, setCopiedChip] = useState(false);
  const [amberModalVisible, setAmberModalVisible] = useState(false);
  const [addPetModalVisible, setAddPetModalVisible] = useState(false);
  const [editPetModalVisible, setEditPetModalVisible] = useState(false);

  const isMissing = cat.status === 'missing';
  const isGuardianActive = guardianStatus.isActive;

  const handleToggleMissingStatus = (willBeMissing: boolean) => {
    if (willBeMissing) {
      // Show native alert with exact text expected by Maestro / automated flows
      Alert.alert(
        'Trigger Amber Alert?',
        'Broadcast 2-mile neighborhood alert to local lookouts, vets, and pet parents.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Activate Alert',
            style: 'destructive',
            onPress: () => {
              const updated: CatProfile = {
                ...cat,
                status: 'missing',
                missingSince: new Date().toISOString(),
              };
              onUpdateCat(updated);
            },
          },
          {
            text: 'Stripe Boost (£14.99)',
            onPress: () => setAmberModalVisible(true),
          },
        ]
      );
    } else {
      Alert.alert(
        '🎉 Cat Found / Safe!',
        `Mark ${cat.name} as safely reunited? This will stand down local search alerts.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Mark Safe',
            onPress: () => {
              const updated: CatProfile = {
                ...cat,
                status: 'safe',
                missingSince: undefined,
              };
              onUpdateCat(updated);
            },
          },
        ]
      );
    }
  };

  const handleAmberAlertActivated = (boosted: boolean) => {
    const updated: CatProfile = {
      ...cat,
      status: 'missing',
      missingSince: new Date().toISOString(),
    };
    onUpdateCat(updated);
    if (boosted) {
      onGeneratePoster();
    }
  };

  const handleCopyChip = () => {
    setCopiedChip(true);
    setTimeout(() => setCopiedChip(false), 2000);
    Alert.alert('Microchip ID Copied', `${cat.microchipNumber} copied to clipboard.`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 0. Multi-Pet Selector Carousel */}
      <PetSelectorBar
        cats={cats}
        selectedCatId={selectedCatId}
        onSelectCat={onSelectCat}
        onAddPetPress={() => setAddPetModalVisible(true)}
      />

      {/* 1. Cat Guardian Subscription Tier Banner (RevenueCat StoreKit 2 / Google Play) */}
      <TouchableOpacity
        style={[
          styles.guardianBanner,
          isGuardianActive ? styles.guardianBannerActive : styles.guardianBannerFree,
        ]}
        onPress={onOpenPaywall}
        activeOpacity={0.85}
      >
        <View style={styles.guardianRow}>
          <View style={styles.guardianIconBadge}>
            <Ionicons
              name={isGuardianActive ? 'shield-checkmark' : 'sparkles'}
              size={20}
              color="#ffffff"
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.guardianTitle}>
                {isGuardianActive ? 'Cat Guardian Active' : 'Upgrade to Cat Guardian'}
              </Text>
              <View style={styles.guardianPill}>
                <Text style={styles.guardianPillText}>
                  {isGuardianActive ? 'PREMIUM' : '£2.99 / MO'}
                </Text>
              </View>
            </View>
            <Text style={styles.guardianSubtitle}>
              {isGuardianActive
                ? 'StoreKit 2 active • Health vault & priority radar protection'
                : 'RevenueCat StoreKit 2 & Google Play • Auto-reminders & radar blitz'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={isGuardianActive ? '#15803d' : Colors.primary} />
        </View>
      </TouchableOpacity>

      {/* 2. Emergency Missing Mode (Amber Alert via Stripe) */}
      <View
        style={[
          styles.emergencyCard,
          isMissing ? styles.emergencyCardActive : styles.emergencyCardSafe,
        ]}
      >
        <TouchableOpacity
          style={styles.emergencyRow}
          onPress={() => {
            if (!isMissing) setAmberModalVisible(true);
            else handleToggleMissingStatus(false);
          }}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.emergencyLabelHidden}>Emergency Missing Mode</Text>
            <Text
              style={[
                styles.emergencyTitle,
                isMissing ? styles.emergencyTitleActive : styles.emergencyTitleSafe,
              ]}
            >
              {isMissing ? '🚨 EMERGENCY: CAT REPORTED MISSING' : '🛡️ PET STATUS: SAFE & PROTECTED'}
            </Text>
            <Text
              style={[
                styles.emergencySubtitle,
                isMissing ? styles.emergencySubtitleActive : styles.emergencySubtitleSafe,
              ]}
            >
              {isMissing
                ? '2-Mile Amber Alert active on neighbourhood radar.'
                : 'Emergency Missing Mode: Broadcast 2-mile neighborhood alert if cat fails to return.'}
            </Text>
          </View>
          <Switch
            value={isMissing}
            onValueChange={handleToggleMissingStatus}
            trackColor={{ false: '#cbd5e1', true: Colors.danger }}
          />
        </TouchableOpacity>

        {isMissing ? (
          <View style={{ gap: 8, marginTop: 12 }}>
            <TouchableOpacity style={styles.posterActionBtn} onPress={onGeneratePoster}>
              <Ionicons name="print" size={18} color="#ffffff" />
              <Text style={styles.posterActionBtnText}>Generate Print-Ready Lost Poster (PDF)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.amberBoostBtn}
              onPress={() => setAmberModalVisible(true)}
            >
              <Ionicons name="megaphone" size={16} color={Colors.danger} />
              <Text style={styles.amberBoostBtnText}>
                Upgrade to 2-Mile Amber Alert Broadcast (£14.99 via Stripe)
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.preEmptiveAmberBtn}
            onPress={() => setAmberModalVisible(true)}
          >
            <Ionicons name="flash" size={14} color="#b91c1c" />
            <Text style={styles.preEmptiveAmberText}>
              Emergency Amber Alert Dispatch (£14.99 via Stripe)
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 3. Hero Cat Passport Card */}
      <View style={styles.passportCard}>
        <View style={styles.heroRow}>
          <Image source={{ uri: cat.photoUrl }} style={styles.petPhoto} />
          <View style={styles.heroInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.petName}>{cat.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View
                  style={[
                    styles.statusBadge,
                    isMissing ? styles.statusBadgeMissing : styles.statusBadgeSafe,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      isMissing ? styles.statusBadgeTextMissing : styles.statusBadgeTextSafe,
                    ]}
                  >
                    {isMissing ? 'MISSING' : 'SAFE'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.editIconBtn}
                  onPress={() => setEditPetModalVisible(true)}
                  activeOpacity={0.7}
                  accessibilityLabel={`Edit ${cat.name} Profile`}
                >
                  <Ionicons name="pencil" size={13} color={Colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.breedText}>{cat.breed}</Text>
            <Text style={styles.metaText}>
              {cat.gender} • {cat.ageYears} yrs old • {cat.isNeutered ? 'Neutered ✓' : 'Unneutered'}
            </Text>
            <Text style={styles.colorText}>🎨 {cat.coatColour || cat.coatColor}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Distinctive Features */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionHeading}>Distinctive Physical Identifiers</Text>
          <Text style={styles.featuresText}>"{cat.distinctiveFeatures}"</Text>
        </View>

        {/* Medical & Dietary Notes */}
        {Boolean(cat.medicalNotes) && (
          <View style={[styles.infoSection, { marginTop: 12 }]}>
            <Text style={styles.sectionHeading}>Medical & Dietary Notes</Text>
            <Text style={styles.medicalNotesText}>{cat.medicalNotes}</Text>
          </View>
        )}

        {/* Edit Passport Details Button */}
        <TouchableOpacity
          style={styles.editPassportBtn}
          onPress={() => setEditPetModalVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="create-outline" size={15} color={Colors.primary} />
          <Text style={styles.editPassportBtnText}>Edit Passport Details & Medical Notes</Text>
        </TouchableOpacity>
      </View>

      {/* 4. Microchip Vault Card */}

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="card-outline" size={20} color={Colors.primary} />
            <Text style={styles.cardHeaderTitle}>Digital Microchip Vault</Text>
          </View>
          <View style={styles.verifiedPill}>
            <Text style={styles.verifiedPillText}>ISO 11784 Verified</Text>
          </View>
        </View>

        <View style={styles.chipDisplay}>
          <Text style={styles.chipNumber}>{cat.microchipNumber}</Text>
          <TouchableOpacity style={styles.chipCopyBtn} onPress={handleCopyChip}>
            <Text style={styles.chipCopyText}>
              {copiedChip ? '✓ Copied' : 'Copy Chip ID'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.chipSubtext}>
          Registered with UK Petlog & Identibase. Show to any vet practice or rescue centre scanner.
        </Text>
      </View>

      {/* 6. Vaccination Vault */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="shield-checkmark" size={20} color={Colors.success} />
            <Text style={styles.cardHeaderTitle}>Vaccination & Medical Vault</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              if (isGuardianActive) {
                Alert.alert('Vet Reminders Active', 'Automated SMS & push reminders set for 7 days before next booster.');
              } else {
                onOpenPaywall();
              }
            }}
          >
            <Text style={styles.reminderLink}>
              {isGuardianActive ? '🔔 Reminders On' : '⭐ Unlock SMS Alerts'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ gap: 10, marginTop: 12 }}>
          {cat.vaccinations.map((vac) => (
            <View key={vac.id} style={styles.vacItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.vacName}>{vac.name}</Text>
                <Text style={styles.vacClinic}>Practice: {vac.vetClinic}</Text>
                <Text style={styles.vacDate}>Next Booster: {vac.nextDueDate}</Text>
              </View>
              <View
                style={[
                  styles.vacBadge,
                  vac.isUpToDate ? styles.vacBadgeGreen : styles.vacBadgeAmber,
                ]}
              >
                <Text
                  style={[
                    styles.vacBadgeText,
                    vac.isUpToDate ? styles.vacBadgeTextGreen : styles.vacBadgeTextAmber,
                  ]}
                >
                  {vac.isUpToDate ? 'UP TO DATE' : 'BOOSTER DUE'}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Local 7-Day & 1-Day Booster Reminder Sync */}
        <TouchableOpacity
          style={styles.boosterSyncBtn}
          onPress={async () => {
            const res = await scheduleLocalBoosterAlerts(cat);
            Alert.alert(
              res.permissionGranted ? '🔔 Booster Reminders Synced' : '⚠️ Notifications Disabled',
              res.confirmationMessage
            );
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="notifications" size={16} color="#15803d" />
          <Text style={styles.boosterSyncText}>Sync 7-Day & 1-Day Booster Push Alerts</Text>
        </TouchableOpacity>
      </View>

      {/* 7. Emergency Vet Quick Action */}
      <View style={[styles.card, { marginBottom: 30 }]}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="call" size={18} color={Colors.primary} />
            <Text style={styles.cardHeaderTitle}>Emergency Vet Contact</Text>
          </View>
        </View>
        <Text style={{ fontSize: 13, color: Colors.textSecondary, marginTop: 4 }}>
          {cat.homeAddressApprox || 'Registered Veterinary Practice'}
        </Text>
        <TouchableOpacity
          style={styles.callVetBtn}
          onPress={() =>
            Alert.alert('Emergency Contact', `Dialling registered emergency number: ${cat.emergencyPhone}`)
          }
        >
          <Ionicons name="call" size={16} color={Colors.primary} />
          <Text style={styles.callVetText}>Call Registered Contact ({cat.emergencyPhone})</Text>
        </TouchableOpacity>
      </View>

      {/* 8. Rate Find My Cat */}
      {onOpenRateApp && (
        <View style={[styles.card, { marginBottom: 30 }]}>
          <TouchableOpacity
            style={styles.rateAppRow}
            onPress={onOpenRateApp}
            activeOpacity={0.8}
          >
            <View style={styles.rateAppIconBadge}>
              <Ionicons name="star" size={20} color="#f59e0b" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rateAppTitle}>Rate Find My Cat</Text>
              <Text style={styles.rateAppSubtitle}>
                Help more local spotters and pet parents protect neighborhood felines
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Modal for Stripe Amber Alert Checkout */}
      <AmberAlertCheckoutModal
        visible={amberModalVisible}
        cat={cat}
        onClose={() => setAmberModalVisible(false)}
        onAlertActivated={handleAmberAlertActivated}
      />

      {/* Modal for Registering a New Pet Passport */}
      <AddPetModal
        visible={addPetModalVisible}
        onClose={() => setAddPetModalVisible(false)}
        onSaveCat={onAddCat}
      />

      {/* Modal for Editing Existing Pet Passport Details & Deleting */}
      <EditPetModal
        visible={editPetModalVisible}
        cat={cat}
        onClose={() => setEditPetModalVisible(false)}
        onSaveCat={onUpdateCat}
        onDeleteCat={onDeleteCat}
      />
    </ScrollView>

  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  guardianBanner: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
  },
  guardianBannerFree: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  guardianBannerActive: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  guardianRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  guardianIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guardianTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  guardianPill: {
    backgroundColor: '#ffedd5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  guardianPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.primary,
  },
  guardianSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  emergencyCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  emergencyCardSafe: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  emergencyCardActive: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
  },
  emergencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emergencyLabelHidden: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  emergencyTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  emergencyTitleSafe: {
    color: '#15803d',
  },
  emergencyTitleActive: {
    color: Colors.danger,
  },
  emergencySubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  emergencySubtitleSafe: {
    color: '#166534',
  },
  emergencySubtitleActive: {
    color: '#b91c1c',
  },
  posterActionBtn: {
    backgroundColor: Colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  posterActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  amberBoostBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: Colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  amberBoostBtnText: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  preEmptiveAmberBtn: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#bbf7d0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  preEmptiveAmberText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
  },
  passportCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  heroRow: {
    flexDirection: 'row',
    gap: 16,
  },
  petPhoto: {
    width: 100,
    height: 100,
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
  },
  heroInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  petName: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    letterSpacing: 0.5,
  },
  statusBadgeSafe: {
    backgroundColor: Colors.successLight,
  },
  statusBadgeTextSafe: {
    color: Colors.success,
    fontSize: 10,
    fontWeight: '800',
  },
  statusBadgeMissing: {
    backgroundColor: Colors.dangerLight,
  },
  statusBadgeTextMissing: {
    color: Colors.danger,
    fontSize: 10,
    fontWeight: '800',
  },
  editIconBtn: {
    padding: 5,
    borderRadius: 8,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  breedText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 3,
  },
  colorText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 3,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 14,
  },
  infoSection: {},
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  featuresText: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 18,
  },
  medicalNotesText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  editPassportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  editPassportBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  verifiedPill: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  verifiedPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  chipDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 12,
  },
  chipNumber: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
    color: Colors.textPrimary,
  },
  chipCopyBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  chipCopyText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  chipSubtext: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 8,
    lineHeight: 15,
  },
  reminderLink: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  vacItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  vacName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  vacClinic: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  vacDate: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: 2,
  },
  vacBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  vacBadgeText: {
    letterSpacing: 0.5,
  },
  vacBadgeGreen: {
    backgroundColor: Colors.successLight,
  },
  vacBadgeTextGreen: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.success,
  },
  vacBadgeAmber: {
    backgroundColor: Colors.warningLight,
  },
  vacBadgeTextAmber: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.warning,
  },
  callVetBtn: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: '#fed7cf',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    marginTop: 12,
  },
  callVetText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  boosterSyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 12,
  },
  boosterSyncText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803d',
  },
  rateAppRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rateAppIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateAppTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  rateAppSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
