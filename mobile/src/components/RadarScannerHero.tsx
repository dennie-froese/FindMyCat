import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { CommunityAlert, SightingReport } from '../types';
import { DEFAULT_RADAR_CENTER, projectCoordsToRadar } from '../services/radarGeometry';

interface RadarScannerHeroProps {
  activeSignalsCount: number;
  alerts?: CommunityAlert[];
  sightings?: SightingReport[];
  onExploreMap?: () => void;
  onSelectSignal?: (signal: CommunityAlert | SightingReport) => void;
}

export const RadarScannerHero: React.FC<RadarScannerHeroProps> = ({
  activeSignalsCount,
  alerts = [],
  sightings = [],
  onExploreMap,
  onSelectSignal,
}) => {
  const sweepAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweepAnim, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [sweepAnim]);

  const sweepRotation = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const centerCoords =
    alerts[0]?.coords ||
    sightings[0]?.jitteredCoords ||
    sightings[0]?.coords ||
    DEFAULT_RADAR_CENTER;

  return (
    <View style={styles.container}>
      {/* Tappable Radar Canvas Card */}
      <TouchableOpacity
        style={styles.radarCard}
        activeOpacity={0.92}
        onPress={onExploreMap}
        accessibilityRole="button"
        accessibilityLabel="Expand interactive neighbourhood radar map"
      >
        {/* Concentric Radar Rings */}
        <View style={styles.outerRing} pointerEvents="none">
          <View style={styles.midRing}>
            <View style={styles.innerRing}>
              {/* Rotating Radar Sweep */}
              <Animated.View
                style={[
                  styles.sweepWrapper,
                  { transform: [{ rotate: sweepRotation }] },
                ]}
              >
                <View style={styles.sweepBeam} />
              </Animated.View>

              {/* User Center Pulse */}
              <View style={styles.centerDot}>
                <View style={styles.centerPulse} />
              </View>
            </View>
          </View>
        </View>

        {/* Dynamically Projected Alert Blips */}
        {alerts.slice(0, 4).map((alert) => {
          const proj = projectCoordsToRadar(alert.coords, centerCoords, 1.0, 0.72);
          const isMissing = alert.type === 'missing_alert' && alert.status !== 'safe';
          const isTnr = alert.type === 'tnr_colony';

          return (
            <TouchableOpacity
              key={alert.id}
              activeOpacity={0.8}
              onPress={() => {
                if (onSelectSignal) {
                  onSelectSignal(alert);
                } else if (onExploreMap) {
                  onExploreMap();
                }
              }}
              style={[
                styles.blipContainer,
                {
                  left: `${Math.min(82, Math.max(12, proj.leftPercent))}%`,
                  top: `${Math.min(72, Math.max(28, proj.topPercent))}%`,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Radar signal: ${alert.title}`}
            >
              <View
                style={[
                  styles.blipDot,
                  isMissing
                    ? styles.blipRed
                    : isTnr
                    ? styles.blipGreen
                    : styles.blipAmber,
                ]}
              />
              <View
                style={
                  isMissing
                    ? styles.blipTagRed
                    : isTnr
                    ? styles.blipTagGreen
                    : styles.blipTagAmber
                }
              >
                <Text
                  style={
                    isMissing
                      ? styles.blipTagTextRed
                      : isTnr
                      ? styles.blipTagTextGreen
                      : styles.blipTagTextAmber
                  }
                  numberOfLines={1}
                >
                  {alert.petName || (isTnr ? 'TNR Colony' : 'Sighting')} ({alert.distanceMiles} mi)
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Dynamically Projected Sighting Blips */}
        {sightings.slice(0, 3).map((sighting) => {
          const coords = sighting.jitteredCoords || sighting.coords;
          const proj = projectCoordsToRadar(coords, centerCoords, 1.0, 0.72);

          return (
            <TouchableOpacity
              key={sighting.id}
              activeOpacity={0.8}
              onPress={() => {
                if (onSelectSignal) {
                  onSelectSignal(sighting);
                } else if (onExploreMap) {
                  onExploreMap();
                }
              }}
              style={[
                styles.blipContainer,
                {
                  left: `${Math.min(82, Math.max(12, proj.leftPercent))}%`,
                  top: `${Math.min(74, Math.max(30, proj.topPercent))}%`,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Radar sighting: ${sighting.catNameHint || 'Spotted Cat'}`}
            >
              <View style={[styles.blipDot, styles.blipAmber]} />
              <View style={styles.blipTagAmber}>
                <Text style={styles.blipTagTextAmber} numberOfLines={1}>
                  {sighting.catNameHint || 'Sighting'} ({sighting.reportedAtDisplay})
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Radar Overlay Header */}
        <View style={styles.headerOverlay} pointerEvents="none">
          <View style={styles.badgeRow}>
            <View style={styles.radarIndicator}>
              <View style={styles.liveGreenDot} />
              <Text style={styles.radarIndicatorText}>SCANNING LOCAL AREA</Text>
            </View>
            <View style={styles.radiusBadgeRow}>
              <Text style={styles.radiusText}>2.0 MI RADIUS</Text>
              <Ionicons name="expand-outline" size={13} color="#38bdf8" />
            </View>
          </View>
          <Text style={styles.heroSignalText}>
            {activeSignalsCount === 0
              ? 'All quiet nearby — tap to explore map or drop a pin'
              : `${activeSignalsCount} active feline ${activeSignalsCount === 1 ? 'signal' : 'signals'} detected nearby`}
          </Text>
        </View>

        {/* Radar Footer Overlay */}
        <View style={styles.footerOverlay}>
          <View style={styles.privacyShieldPill}>
            <Ionicons name="shield-checkmark" size={12} color="#a5b4fc" />
            <Text style={styles.privacyShieldText}>200m Geo-Shield</Text>
          </View>

          <TouchableOpacity
            style={styles.expandMapPill}
            onPress={onExploreMap}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Expand Interactive Map and Drop Pin"
          >
            <Ionicons name="map" size={12} color="#ffffff" />
            <Text style={styles.expandMapPillText}>Expand Map & Drop Pin</Text>
            <Ionicons name="chevron-forward" size={12} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
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
    height: 204,
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
    top: -24,
    left: '50%',
    marginLeft: -130,
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  midRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sweepWrapper: {
    position: 'absolute',
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  sweepBeam: {
    width: 2,
    height: 110,
    backgroundColor: 'rgba(56, 189, 248, 0.35)',
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
    transform: [{ translateX: -36 }, { translateY: -12 }],
  },
  blipDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
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
    backgroundColor: 'rgba(239, 68, 68, 0.92)',
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
    backgroundColor: 'rgba(245, 158, 11, 0.92)',
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
    backgroundColor: 'rgba(16, 185, 129, 0.92)',
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
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
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
  radiusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  radiusText: {
    color: '#94a3b8',
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
  expandMapPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  expandMapPillText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
});
