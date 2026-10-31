import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { CommunityAlert, SightingReport } from '../types';

interface RadarScannerHeroProps {
  activeSignalsCount: number;
  alerts?: CommunityAlert[];
  sightings?: SightingReport[];
  onExploreMap?: () => void;
}

export const RadarScannerHero: React.FC<RadarScannerHeroProps> = ({
  activeSignalsCount,
  alerts = [],
  sightings = [],
}) => {
  const missingBlip = alerts.find((a) => a.type === 'missing_alert' && a.status !== 'safe');
  const tnrBlip = alerts.find((a) => a.type === 'tnr_colony');
  const latestSighting = sightings[0];
  return (
    <View style={styles.container}>
      {/* Radar Canvas Card */}
      <View style={styles.radarCard}>
        {/* Concentric Radar Rings */}
        <View style={styles.outerRing}>
          <View style={styles.midRing}>
            <View style={styles.innerRing}>
              {/* User Center Pulse */}
              <View style={styles.centerDot}>
                <View style={styles.centerPulse} />
              </View>
            </View>
          </View>
        </View>

        {/* Dynamic Radar Blip: Active Missing Cat Alert */}
        {missingBlip && (
          <View style={[styles.blipContainer, { top: 28, right: 56 }]}>
            <View style={[styles.blipDot, styles.blipRed]} />
            <View style={styles.blipTagRed}>
              <Text style={styles.blipTagTextRed} numberOfLines={1}>
                {missingBlip.petName || 'Missing Cat'} ({missingBlip.distanceMiles} mi)
              </Text>
            </View>
          </View>
        )}

        {/* Dynamic Radar Blip: Recent Sighting */}
        {latestSighting && (
          <View style={[styles.blipContainer, { bottom: 35, right: 68 }]}>
            <View style={[styles.blipDot, styles.blipAmber]} />
            <View style={styles.blipTagAmber}>
              <Text style={styles.blipTagTextAmber} numberOfLines={1}>
                {latestSighting.catNameHint || 'Sighting'} ({latestSighting.reportedAtDisplay})
              </Text>
            </View>
          </View>
        )}

        {/* Dynamic Radar Blip: TNR Colony */}
        {tnrBlip && (
          <View style={[styles.blipContainer, { top: 45, left: 48 }]}>
            <View style={[styles.blipDot, styles.blipGreen]} />
            <View style={styles.blipTagGreen}>
              <Text style={styles.blipTagTextGreen} numberOfLines={1}>
                TNR Colony ({tnrBlip.distanceMiles} mi)
              </Text>
            </View>
          </View>
        )}

        {/* Radar Overlay Header */}
        <View style={styles.headerOverlay}>
          <View style={styles.badgeRow}>
            <View style={styles.radarIndicator}>
              <View style={styles.liveGreenDot} />
              <Text style={styles.radarIndicatorText}>SCANNING LOCAL AREA</Text>
            </View>
            <Text style={styles.radiusText}>2.0 MI RADIUS</Text>
          </View>
          <Text style={styles.heroSignalText}>
            {activeSignalsCount === 0
              ? 'All quiet nearby — no active alerts in your radius'
              : `${activeSignalsCount} active feline ${activeSignalsCount === 1 ? 'signal' : 'signals'} detected nearby`}
          </Text>
        </View>

        {/* Radar Footer Overlay */}
        <View style={styles.footerOverlay}>
          <View style={styles.privacyShieldPill}>
            <Ionicons name="shield-checkmark" size={12} color="#a5b4fc" />
            <Text style={styles.privacyShieldText}>Dual-Zone 200m Geo-Shield Active</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  radarCard: {
    backgroundColor: '#090d16',
    borderRadius: 20,
    height: 175,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#1e293b',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  outerRing: {
    position: 'absolute',
    top: -45,
    left: '50%',
    marginLeft: -130,
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  midRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#38bdf8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPulse: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.5)',
  },
  blipContainer: {
    position: 'absolute',
    alignItems: 'center',
    gap: 3,
  },
  blipDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  blipRed: {
    backgroundColor: '#ef4444',
  },
  blipAmber: {
    backgroundColor: '#f59e0b',
  },
  blipGreen: {
    backgroundColor: '#10b981',
  },
  blipTagRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  blipTagTextRed: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  blipTagAmber: {
    backgroundColor: 'rgba(245, 158, 11, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  blipTagTextAmber: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  blipTagGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  blipTagTextGreen: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  headerOverlay: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  radarIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  liveGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  radarIndicatorText: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  radiusText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  heroSignalText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
    letterSpacing: -0.2,
  },
  footerOverlay: {
    position: 'absolute',
    bottom: 10,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  privacyShieldPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
  },
  privacyShieldText: {
    color: '#c7d2fe',
    fontSize: 10,
    fontWeight: '600',
  },
});
