import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Image,
  TouchableOpacity,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { CommunityAlert, SightingReport } from '../types';

export interface SignalDetailModalProps {
  visible: boolean;
  onClose: () => void;
  signal: CommunityAlert | SightingReport | null;
  onOpenReport?: (prefillHint?: string) => void;
}

export const SignalDetailModal: React.FC<SignalDetailModalProps> = ({
  visible,
  onClose,
  signal,
  onOpenReport,
}) => {
  if (!signal) return null;

  // Determine whether this signal is an Alert or an Anonymous Sighting
  const isAlert = 'type' in signal;
  const alert = isAlert ? (signal as CommunityAlert) : null;
  const sighting = !isAlert ? (signal as SightingReport) : null;

  const photoUrl = alert ? alert.photoUrl : sighting?.photoUri;
  const title = alert
    ? alert.title
    : sighting?.catNameHint || `${sighting?.coatColour || sighting?.coatColor || 'Spotted'} Cat`;
  const subtitle = alert ? alert.subtitle : sighting?.notes;
  const locationText = alert
    ? `~${alert.distanceMiles} miles away in local radius`
    : sighting?.approximateLocationName || 'Approximate neighbourhood area';
  const timeText = alert ? alert.timeAgo : sighting?.reportedAtDisplay;
  const badgeText = alert
    ? alert.badgeText
    : sighting?.isAnonymous
    ? 'ANONYMOUS SIGHTING'
    : 'VERIFIED SIGHTING';

  const handleShare = async () => {
    try {
      await Share.share({
        title: `Find My Cat Alert: ${title}`,
        message: `🚨 FindMyCat Incident Alert: ${title} (${locationText}).\n\n"${subtitle}"\n\nHelp spot this cat at https://find-my-cat.uk`,
      });
    } catch (err) {
      console.warn('Share error', err);
    }
  };

  const handleAction = () => {
    onClose();
    if (onOpenReport) {
      onOpenReport(title);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.sheetContainer}>
          {/* Top Grabber */}
          <View style={styles.dragHandle} />

          {/* Header Row */}
          <View style={styles.headerRow}>
            <View
              style={[
                styles.badge,
                alert?.status === 'critical'
                  ? styles.badgeCritical
                  : styles.badgeNormal,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  alert?.status === 'critical'
                    ? styles.badgeTextCritical
                    : styles.badgeTextNormal,
                ]}
              >
                {badgeText}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Hero Image */}
            {photoUrl && (
              <View style={styles.imageContainer}>
                <Image
                  source={{ uri: photoUrl }}
                  style={styles.heroImage}
                  resizeMode="cover"
                />
                <View style={styles.timeTagOverlay}>
                  <Ionicons name="time" size={12} color="#ffffff" />
                  <Text style={styles.timeTagText}>{timeText}</Text>
                </View>
              </View>
            )}

            {/* Title & Location */}
            <Text style={styles.title}>{title}</Text>

            <View style={styles.locationRow}>
              <Ionicons name="location" size={16} color={Colors.primary} />
              <Text style={styles.locationText}>{locationText}</Text>
            </View>

            {/* Notes / Description */}
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>SIGNAL DETAILS</Text>
              <Text style={styles.notesText}>{subtitle}</Text>

              {sighting?.collarDescription && (
                <View style={styles.collarRow}>
                  <Text style={styles.collarLabel}>Collar / Tag:</Text>
                  <Text style={styles.collarValue}>
                    {sighting.collarDescription}
                  </Text>
                </View>
              )}
            </View>

            {/* Privacy Shield Info Banner */}
            <View style={styles.privacyBanner}>
              <Ionicons name="lock-closed" size={16} color="#4f46e5" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.privacyTitle}>
                  Dual-Zone Privacy Shield Active
                </Text>
                <Text style={styles.privacyDesc}>
                  Exact GPS coordinates are automatically buffered by 100m–200m to protect pet and guardian safety while aiding community discovery.
                </Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionsContainer}>
              <TouchableOpacity
                style={styles.primaryActionButton}
                onPress={handleAction}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="camera"
                  size={18}
                  color="#ffffff"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.primaryActionText}>
                  {alert ? 'I Spotted This Cat!' : 'Report Matching Sighting'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryActionButton}
                onPress={handleShare}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="share-outline"
                  size={18}
                  color={Colors.textPrimary}
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.secondaryActionText}>Share Alert</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  badgeCritical: {
    backgroundColor: '#fee2e2',
  },
  badgeNormal: {
    backgroundColor: '#e0e7ff',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  badgeTextCritical: {
    color: '#dc2626',
  },
  badgeTextNormal: {
    color: '#4f46e5',
  },
  scrollContent: {
    padding: 20,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
    marginBottom: 16,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  timeTagOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 5,
  },
  timeTagText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  locationText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  notesBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  notesLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  notesText: {
    fontSize: 15,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  collarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 6,
  },
  collarLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  collarValue: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  privacyBanner: {
    flexDirection: 'row',
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  privacyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3730a3',
    marginBottom: 2,
  },
  privacyDesc: {
    fontSize: 12,
    color: '#4338ca',
    lineHeight: 17,
  },
  actionsContainer: {
    gap: 10,
    marginBottom: 10,
  },
  primaryActionButton: {
    flexDirection: 'row',
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryActionButton: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
});
