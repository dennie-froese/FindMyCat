import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { CatProfile } from '../types';
import { generateAndSharePoster } from '../services/posterGenerator';

interface PosterPreviewScreenProps {
  cat: CatProfile;
  cats?: CatProfile[];
  onSelectCat?: (catId: string) => void;
  onPosterExported?: () => void;
}

export const PosterPreviewScreen: React.FC<PosterPreviewScreenProps> = ({
  cat,
  cats,
  onSelectCat,
  onPosterExported,
}) => {
  const [generating, setGenerating] = useState(false);

  const baseUrl = process.env.EXPO_PUBLIC_WEB_BASE_URL || 'https://find-my-cat.uk';
  const sightingUrl = `${baseUrl}/sighting/?id=${encodeURIComponent(cat.id)}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
    sightingUrl
  )}`;

  const handlePrint = async () => {
    try {
      setGenerating(true);
      await generateAndSharePoster(cat);
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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

      {/* Live Flyer Mockup Preview */}
      <View style={styles.posterContainer}>
        {/* Red Banner */}
        <View style={styles.posterBanner}>
          <Text style={styles.bannerMainText}>PLEASE HELP FIND ME</Text>
          <Text style={styles.bannerSubText}>LOST CAT ALERT</Text>
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
          <Text style={styles.lastSeenText}>{cat.homeAddressApprox || 'Local neighbourhood area'}</Text>
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
});
