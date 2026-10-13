import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { SightingReport, CommunityAlert } from '../types';
import { RadarScannerHero } from '../components/RadarScannerHero';

interface SightingsFeedScreenProps {
  sightings: SightingReport[];
  alerts: CommunityAlert[];
  onOpenReport: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

type FilterType = 'all' | 'alerts' | 'sightings' | 'tnr';

export const SightingsFeedScreen: React.FC<SightingsFeedScreenProps> = ({
  sightings,
  alerts,
  onOpenReport,
  onRefresh,
  refreshing,
}) => {
  const [filter, setFilter] = useState<FilterType>('all');

  const filteredSightings = sightings.filter(() => filter === 'all' || filter === 'sightings');
  const filteredAlerts = alerts.filter((a) => {
    if (filter === 'all') return true;
    if (filter === 'alerts') return a.type === 'missing_alert';
    if (filter === 'tnr') return a.type === 'tnr_colony';
    return true;
  });

  const totalActiveSignals = alerts.length + sightings.length;

  return (
    <View style={styles.container}>
      {/* Scrollable Feed */}
      <ScrollView
        style={styles.feedScroll}
        contentContainerStyle={styles.feedContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Visual Neighborhood Radar Card */}
        <RadarScannerHero activeSignalsCount={totalActiveSignals} />

        {/* Filter Chips Bar - Strictly constrained height */}
        <View style={styles.filterSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScrollView}
            contentContainerStyle={styles.filterScrollContent}
          >
            <TouchableOpacity
              style={[styles.chip, filter === 'all' && styles.chipActive]}
              onPress={() => setFilter('all')}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, filter === 'all' && styles.chipTextActive]}>
                All Signals ({totalActiveSignals})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.chip, filter === 'alerts' && styles.chipActive]}
              onPress={() => setFilter('alerts')}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, filter === 'alerts' && styles.chipTextActive]}>
                🚨 Lost Alerts ({alerts.filter((a) => a.type === 'missing_alert').length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.chip, filter === 'sightings' && styles.chipActive]}
              onPress={() => setFilter('sightings')}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, filter === 'sightings' && styles.chipTextActive]}>
                👀 Sightings ({sightings.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.chip, filter === 'tnr' && styles.chipActive]}
              onPress={() => setFilter('tnr')}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, filter === 'tnr' && styles.chipTextActive]}>
                🏡 TNR Colonies (1)
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* List Items Header */}
        <View style={styles.listHeaderRow}>
          <Text style={styles.listSectionTitle}>Neighbourhood Incident Feed</Text>
          <Text style={styles.listSectionMeta}>Real-time proximity</Text>
        </View>

        {/* Critical Alerts */}
        {(filter === 'all' || filter === 'alerts' || filter === 'tnr') &&
          filteredAlerts.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardTopRow}>
                <View
                  style={[
                    styles.statusBadge,
                    item.status === 'critical'
                      ? styles.badgeCritical
                      : item.status === 'active'
                      ? styles.badgeActive
                      : styles.badgeSafe,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      item.status === 'critical'
                        ? styles.statusBadgeTextCritical
                        : item.status === 'active'
                        ? styles.statusBadgeTextActive
                        : styles.statusBadgeTextSafe,
                    ]}
                  >
                    {item.badgeText}
                  </Text>
                </View>

                <View style={styles.privacyTag}>
                  <Ionicons name="lock-closed" size={10} color="#6366f1" />
                  <Text style={styles.privacyTagText}>200m Geo-Shield</Text>
                </View>
              </View>

              <View style={styles.cardMain}>
                <View style={styles.imageWrapper}>
                  <Image source={{ uri: item.photoUrl }} style={styles.cardImage} />
                  <View style={styles.distanceOverlay}>
                    <Text style={styles.distanceOverlayText}>
                      ~{item.distanceMiles} mi
                    </Text>
                  </View>
                </View>

                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardSubtitle} numberOfLines={2}>
                    {item.subtitle}
                  </Text>

                  <View style={styles.cardFooter}>
                    <View style={styles.timeTag}>
                      <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
                      <Text style={styles.timeText}>{item.timeAgo}</Text>
                    </View>

                    <Text style={styles.actionPrompt}>View Details →</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}

        {/* Sightings */}
        {(filter === 'all' || filter === 'sightings') &&
          filteredSightings.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardTopRow}>
                <View style={[styles.statusBadge, styles.badgeSighting]}>
                  <Text style={[styles.statusBadgeText, styles.statusBadgeTextSighting]}>
                    ANONYMOUS SIGHTING
                  </Text>
                </View>

                <View style={styles.privacyTag}>
                  <Ionicons name="lock-closed" size={10} color="#6366f1" />
                  <Text style={styles.privacyTagText}>200m Geo-Shield</Text>
                </View>
              </View>

              <View style={styles.cardMain}>
                <View style={styles.imageWrapper}>
                  <Image source={{ uri: item.photoUri }} style={styles.cardImage} />
                  <View style={[styles.distanceOverlay, { backgroundColor: 'rgba(37, 99, 235, 0.85)' }]}>
                    <Text style={styles.distanceOverlayText}>Spotted</Text>
                  </View>
                </View>

                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle}>
                    {item.catNameHint || `${item.coatColour || item.coatColor || 'Unidentified'} Cat`}
                  </Text>
                  <View style={styles.locationSnippetRow}>
                    <Ionicons name="location" size={12} color={Colors.primary} />
                    <Text style={styles.locationSnippet} numberOfLines={1}>
                      {item.approximateLocationName}
                    </Text>
                  </View>

                  <Text style={styles.sightingNotes} numberOfLines={2}>
                    "{item.notes}"
                  </Text>

                  <View style={styles.cardFooter}>
                    <View style={styles.timeTag}>
                      <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
                      <Text style={styles.timeText}>{item.reportedAtDisplay}</Text>
                    </View>

                    {item.collarDescription && (
                      <Text style={styles.collarSnippet} numberOfLines={1}>
                        🏷️ {item.collarDescription}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            </View>
          ))}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  feedScroll: {
    flex: 1,
  },
  feedContent: {
    paddingBottom: 40,
  },
  filterSection: {
    height: 48,
    marginTop: 8,
    marginBottom: 4,
  },
  filterScrollView: {
    flexGrow: 0,
    height: 48,
  },
  filterScrollContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignSelf: 'center',
  },
  chipActive: {
    backgroundColor: Colors.textPrimary,
    borderColor: Colors.textPrimary,
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 10,
  },
  listSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listSectionMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeCritical: {
    backgroundColor: Colors.dangerLight,
  },
  statusBadgeTextCritical: {
    color: Colors.danger,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  badgeActive: {
    backgroundColor: Colors.primaryLight,
  },
  statusBadgeTextActive: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  badgeSafe: {
    backgroundColor: Colors.successLight,
  },
  statusBadgeTextSafe: {
    color: Colors.success,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  badgeSighting: {
    backgroundColor: '#eff6ff',
  },
  statusBadgeTextSighting: {
    color: '#2563eb',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  statusBadgeText: {},
  privacyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eef2ff',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  privacyTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4f46e5',
  },
  cardMain: {
    flexDirection: 'row',
    gap: 12,
  },
  imageWrapper: {
    width: 90,
    height: 90,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#f1f5f9',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  distanceOverlay: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  distanceOverlayText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  locationSnippetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  locationSnippet: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
    flex: 1,
  },
  sightingNotes: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 3,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 4,
  },
  timeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  timeText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  collarSnippet: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '500',
    maxWidth: 120,
  },
  actionPrompt: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  bottomSpacer: {
    height: 40,
  },
});
