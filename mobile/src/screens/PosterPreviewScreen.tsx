import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { CatProfile } from '../types';
import { generateAndSharePoster } from '../services/posterGenerator';
import { EditPetModal } from '../components/EditPetModal';

interface PosterPreviewScreenProps {
  cat: CatProfile;
  cats?: CatProfile[];
  onSelectCat?: (catId: string) => void;
  onUpdateCat?: (updated: CatProfile) => void;
  onDeleteCat?: (catId: string) => void;
  onPosterExported?: () => void;
}

export const PosterPreviewScreen: React.FC<PosterPreviewScreenProps> = ({
  cat,
  cats,
  onSelectCat,
  onUpdateCat,
  onDeleteCat,
  onPosterExported,
}) => {
  const [generating, setGenerating] = useState(false);
  const [customisingPoster, setCustomisingPoster] = useState(false);
  const [editPetModalVisible, setEditPetModalVisible] = useState(false);

  const [headline, setHeadline] = useState(cat.posterHeadline || 'PLEASE HELP FIND ME');
  const [rewardOffered, setRewardOffered] = useState<boolean>(Boolean(cat.posterRewardOffered));
  const [rewardText, setRewardText] = useState(cat.posterRewardText || 'Reward Offered');
  const [lastSeenNote, setLastSeenNote] = useState(
    cat.posterLastSeenNote || cat.homeAddressApprox || ''
  );

  useEffect(() => {
    setHeadline(cat.posterHeadline || 'PLEASE HELP FIND ME');
    setRewardOffered(Boolean(cat.posterRewardOffered));
    setRewardText(cat.posterRewardText || 'Reward Offered');
    setLastSeenNote(cat.posterLastSeenNote || cat.homeAddressApprox || '');
  }, [cat]);

  const buildEffectiveCat = (): CatProfile => ({
    ...cat,
    posterHeadline: headline.trim() || 'PLEASE HELP FIND ME',
    posterRewardOffered: rewardOffered,
    posterRewardText: rewardOffered ? rewardText.trim() || 'Reward Offered' : '',
    posterLastSeenNote: lastSeenNote.trim() || undefined,
    homeAddressApprox: lastSeenNote.trim() || cat.homeAddressApprox,
  });

  const handleSaveFlyerCustomisation = () => {
    const updated = buildEffectiveCat();
    if (onUpdateCat) {
      onUpdateCat(updated);
    }
    setCustomisingPoster(false);
  };

  const baseUrl = process.env.EXPO_PUBLIC_WEB_BASE_URL || 'https://find-my-cat.uk';
  const sightingUrl = `${baseUrl}/sighting/?id=${encodeURIComponent(cat.id)}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
    sightingUrl
  )}`;

  const handlePrint = async () => {
    try {
      setGenerating(true);
      const effectiveCat = buildEffectiveCat();
      if (onUpdateCat) {
        onUpdateCat(effectiveCat);
      }
      await generateAndSharePoster(effectiveCat);
      if (onPosterExported) {
        onPosterExported();
      }
    } catch (error) {
      Alert.alert('Export Failed', 'Unable to render printable PDF. Please verify printer/sharing permissions.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Multi-Pet Selector for Poster if multiple cats exist */}
      {cats && cats.length > 1 && onSelectCat && (
        <View style={styles.petSelectorWrapper}>
          <Text style={styles.petSelectorLabel}>SELECT CAT FOR POSTER:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.petSelectorScroll}
          >
            {cats.map((c) => {
              const isSelected = c.id === cat.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.petSelectorPill,
                    isSelected && styles.petSelectorPillActive,
                  ]}
                  onPress={() => onSelectCat(c.id)}
                  activeOpacity={0.7}
                >
                  <Image source={{ uri: c.photoUrl }} style={styles.pillAvatar} />
                  <Text
                    style={[
                      styles.pillText,
                      isSelected && styles.pillTextActive,
                    ]}
                  >
                    {c.name} {c.status === 'missing' ? '🚨' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Intro info box */}
      <View style={styles.infoBanner}>
        <Ionicons name="flash" size={20} color="#1d4ed8" />
        <View style={{ flex: 1 }}>
          <Text style={styles.infoTitle}>
            {cat.status === 'missing' ? 'EMERGENCY LOST POSTER READY' : 'PREPAREDNESS POSTER PREVIEW'}
          </Text>
          <Text style={styles.infoDesc}>
            {cat.status === 'missing'
              ? 'Physical posters equipped with dynamic QR codes allow passing neighbours to log instant sightings directly into this app without downloading anything.'
              : `${cat.name} is currently marked Safe. Preview or print a standby flyer now, or activate Missing Mode in the Passport tab if ${cat.name} goes missing.`}
          </Text>
        </View>
      </View>

      {/* Poster Edit & Customise Action Toolbar */}
      <View style={styles.editToolbarRow}>
        <TouchableOpacity
          style={[
            styles.editToolbarBtn,
            customisingPoster && styles.editToolbarBtnActive,
          ]}
          onPress={() => setCustomisingPoster((prev) => !prev)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Customise flyer banner, reward, and last seen location"
        >
          <Ionicons
            name={customisingPoster ? 'chevron-up' : 'options-outline'}
            size={16}
            color={customisingPoster ? '#ffffff' : Colors.primary}
          />
          <Text
            style={[
              styles.editToolbarBtnText,
              customisingPoster && styles.editToolbarBtnTextActive,
            ]}
          >
            {customisingPoster ? 'Hide Flyer Options' : 'Customise Flyer & Reward'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.editToolbarBtnSecondary}
          onPress={() => setEditPetModalVisible(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${cat.name} photo, markings, and phone number`}
        >
          <Ionicons name="create-outline" size={16} color={Colors.textPrimary} />
          <Text style={styles.editToolbarBtnSecondaryText}>Edit Cat & Photo</Text>
        </TouchableOpacity>
      </View>

      {/* Collapsible Inline Flyer Customiser */}
      {customisingPoster && (
        <View style={styles.customiserCard}>
          <Text style={styles.customiserHeading}>CUSTOMISE FLYER TEXT (LIVE PREVIEW)</Text>

          <View style={styles.customiserField}>
            <Text style={styles.customiserLabel}>Banner Headline</Text>
            <TextInput
              style={styles.customiserInput}
              value={headline}
              onChangeText={setHeadline}
              placeholder="PLEASE HELP FIND ME"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <View style={styles.customiserSwitchRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.customiserLabel}>Include Reward on Banner</Text>
              <Text style={styles.customiserHint}>
                Adds a reward badge to the red header banner
              </Text>
            </View>
            <Switch
              value={rewardOffered}
              onValueChange={setRewardOffered}
              trackColor={{ false: '#cbd5e1', true: Colors.primary }}
              accessibilityLabel="Include reward on banner"
            />
          </View>

          {rewardOffered && (
            <View style={styles.customiserField}>
              <Text style={styles.customiserLabel}>Reward Text / Amount</Text>
              <TextInput
                style={styles.customiserInput}
                value={rewardText}
                onChangeText={setRewardText}
                placeholder="e.g. £50 Reward Offered"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
          )}

          <View style={styles.customiserField}>
            <Text style={styles.customiserLabel}>Last Seen Vicinity / Time</Text>
            <TextInput
              style={styles.customiserInput}
              value={lastSeenNote}
              onChangeText={setLastSeenNote}
              placeholder="e.g. Last seen Tuesday 8pm near St. Mark’s Gate"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <TouchableOpacity
            style={styles.saveCustomiserBtn}
            onPress={handleSaveFlyerCustomisation}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-circle" size={16} color="#ffffff" />
            <Text style={styles.saveCustomiserBtnText}>Save Flyer Text</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Live Flyer Mockup Preview */}
      <View style={styles.posterContainer}>
        {/* Red Banner */}
        <View style={styles.posterBanner}>
          <Text style={styles.bannerMainText}>
            {(headline.trim() || 'PLEASE HELP FIND ME').toUpperCase()}
          </Text>
          <Text style={styles.bannerSubText}>
            {rewardOffered
              ? `LOST CAT ALERT • ${(rewardText.trim() || 'REWARD OFFERED').toUpperCase()}`
              : 'LOST CAT ALERT'}
          </Text>
        </View>

        {/* Photo Frame */}
        <View style={styles.photoFrame}>
          <Image source={{ uri: cat.photoUrl }} style={styles.photo} />
        </View>

        {/* Pet Name */}
        <Text style={styles.catName}>{cat.name.toUpperCase()}</Text>
        <Text style={styles.catBreed}>
          {[cat.breed, cat.gender].filter(Boolean).join(' • ')}
        </Text>

        {/* Specs Box */}
        <View style={styles.specsBox}>
          <View style={styles.specRow}>
            <Text style={styles.specLabel}>Coat Colour & Markings:</Text>
            <Text style={styles.specVal}>{cat.coatColour || cat.coatColor || 'Not specified'}</Text>
          </View>
          <View style={styles.specRow}>
            <Text style={styles.specLabel}>Microchip:</Text>
            <Text style={styles.specVal}>
              {cat.microchipNumber
                ? `Microchipped (ending ${cat.microchipNumber.slice(-4)})`
                : 'Not recorded'}
            </Text>
          </View>
          <View style={[styles.specRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.specLabel}>Distinguishing Clues:</Text>
            <Text style={styles.specVal}>{cat.distinctiveFeatures || 'None noted'}</Text>
          </View>
        </View>

        {/* Last Seen Box */}
        <View style={styles.lastSeenBox}>
          <Text style={styles.lastSeenLabel}>LAST SEEN VICINITY:</Text>
          <Text style={styles.lastSeenText}>
            {lastSeenNote.trim() || cat.homeAddressApprox || 'Local neighbourhood area'}
          </Text>
        </View>

        {/* Footer with Phone & QR */}
        <View style={styles.footerRow}>
          <View style={styles.phoneCol}>
            <Text style={styles.callLabel}>IF SEEN, CALL/TEXT:</Text>
            <Text style={styles.phoneVal}>{cat.emergencyPhone || 'Add phone in Passport'}</Text>
          </View>

          <View style={styles.qrCol}>
            <Image source={{ uri: qrCodeUrl }} style={styles.qrImage} />
            <Text style={styles.qrNote}>SCAN TO REPORT{'\n'}SIGHTING FAST</Text>
          </View>
        </View>
      </View>

      {/* Generation Button */}
      <TouchableOpacity
        style={styles.printBtn}
        onPress={handlePrint}
        disabled={generating}
      >
        {generating ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <>
            <Ionicons name="print" size={20} color="#ffffff" />
            <Text style={styles.printBtnText}>Generate & Print High-Res PDF (A4)</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.footerHint}>
        Vector PDF format is calibrated for high-visibility lamp posts and community noticeboards.
      </Text>

      {/* Modal for Editing Cat Photo, Clues, Microchip & Emergency Phone */}
      <EditPetModal
        visible={editPetModalVisible}
        cat={cat}
        onClose={() => setEditPetModalVisible(false)}
        onSaveCat={(updated) => {
          if (onUpdateCat) {
            onUpdateCat(updated);
          }
        }}
        onDeleteCat={onDeleteCat}
      />

      <View style={{ height: 40 }} />
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
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  infoIcon: {
    fontSize: 22,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1d4ed8',
    letterSpacing: 0.5,
  },
  infoDesc: {
    fontSize: 12,
    color: '#1e40af',
    marginTop: 2,
    lineHeight: 16,
  },
  posterContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.textPrimary,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  posterBanner: {
    backgroundColor: Colors.danger,
    width: '100%',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 14,
  },
  bannerMainText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
  },
  bannerSubText: {
    color: '#fee2e2',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  photoFrame: {
    width: 220,
    height: 190,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: Colors.textPrimary,
    marginBottom: 10,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  catName: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  catBreed: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  specsBox: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  specRow: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  specLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  specVal: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '600',
    marginTop: 1,
  },
  lastSeenBox: {
    width: '100%',
    backgroundColor: '#fef1ee',
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    padding: 8,
    borderRadius: 4,
    marginBottom: 14,
  },
  lastSeenLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary,
  },
  lastSeenText: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontWeight: '600',
    marginTop: 2,
  },
  footerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 2,
    borderTopColor: Colors.textPrimary,
    paddingTop: 12,
  },
  phoneCol: {
    flex: 1,
  },
  callLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.danger,
    letterSpacing: 0.5,
  },
  phoneVal: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  qrCol: {
    alignItems: 'center',
    gap: 4,
  },
  qrImage: {
    width: 64,
    height: 64,
    borderWidth: 1.5,
    borderColor: Colors.textPrimary,
    borderRadius: 4,
  },
  qrNote: {
    fontSize: 8,
    fontWeight: '800',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 10,
  },
  printBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  printBtnIcon: {
    fontSize: 20,
  },
  printBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  footerHint: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  petSelectorWrapper: {
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 4,
  },
  petSelectorLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  petSelectorScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  petSelectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  petSelectorPillActive: {
    backgroundColor: '#fff7ed',
    borderColor: Colors.primary,
  },
  pillAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#cbd5e1',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  pillTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  editToolbarRow: {
    flexDirection: 'row',
    gap: 10,
  },
  editToolbarBtn: {
    flex: 1.25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#fff7ed',
    borderWidth: 1.5,
    borderColor: '#fed7aa',
  },
  editToolbarBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  editToolbarBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  editToolbarBtnTextActive: {
    color: '#ffffff',
  },
  editToolbarBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  editToolbarBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  customiserCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#fed7aa',
    gap: 12,
  },
  customiserHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.6,
  },
  customiserField: {
    gap: 5,
  },
  customiserLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  customiserHint: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  customiserInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  customiserSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  saveCustomiserBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: 11,
    borderRadius: 10,
    marginTop: 2,
  },
  saveCustomiserBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
});
