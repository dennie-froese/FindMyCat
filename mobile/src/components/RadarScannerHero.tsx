import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import MapView, { Marker, Circle, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { CommunityAlert, SightingReport } from '../types';
import { DEFAULT_RADAR_CENTER, GeoCoordinates } from '../services/radarGeometry';

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
  const mapRef = useRef<MapView | null>(null);
  const [userCoords, setUserCoords] = useState<GeoCoordinates | null>(null);
  const [locating, setLocating] = useState<boolean>(true);
  const [areaLabel, setAreaLabel] = useState<string>('Locating your neighbourhood...');
  const [region, setRegion] = useState<Region>({
    latitude: DEFAULT_RADAR_CENTER.latitude,
    longitude: DEFAULT_RADAR_CENTER.longitude,
    latitudeDelta: 0.025,
    longitudeDelta: 0.025,
  });

  const centerOnUserLocation = async (animate: boolean = true) => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setAreaLabel('Location access off — enable in Settings');
        setLocating(false);
        return;
      }

      // Fast initial fix from last known position if available
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown?.coords) {
        const fastRegion: Region = {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        };
        setUserCoords({
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
        });
        setRegion(fastRegion);
        if (animate && mapRef.current) {
          mapRef.current.animateToRegion(fastRegion, 400);
        }
      }

      // Fresh high-accuracy GPS fix
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const liveCoords = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };
      const nextRegion: Region = {
        latitude: liveCoords.latitude,
        longitude: liveCoords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
      setUserCoords(liveCoords);
      setRegion(nextRegion);
      if (mapRef.current) {
        mapRef.current.animateToRegion(nextRegion, 500);
      }

      // Resolve human-readable neighbourhood label
      try {
        const places = await Location.reverseGeocodeAsync(liveCoords);
        if (places && places[0]) {
          const p = places[0];
          const labelParts = [p.street || p.district || p.subregion, p.city || p.postalCode]
            .filter(Boolean)
            .slice(0, 2);
          if (labelParts.length > 0) {
            setAreaLabel(labelParts.join(', '));
          } else {
            setAreaLabel('Live GPS Active');
          }
        } else {
          setAreaLabel('Live GPS Active');
        }
      } catch {
        setAreaLabel('Live GPS Active');
      }
    } catch {
      setAreaLabel('Tap Locate to center on your GPS');
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    centerOnUserLocation(false);
  }, []);

  const activeCenter = userCoords || {
    latitude: region.latitude,
    longitude: region.longitude,
  };

  return (
    <View style={styles.container}>
      <View style={styles.mapCard}>
        <MapView
          ref={mapRef}
          style={styles.mapView}
          initialRegion={region}
          onRegionChangeComplete={(nextRegion) => setRegion(nextRegion)}
          showsUserLocation={true}
          showsMyLocationButton={false}
          showsCompass={true}
          scrollEnabled={true}
          zoomEnabled={true}
          pitchEnabled={true}
          rotateEnabled={true}
          userInterfaceStyle="light"
        >
          {/* 2-Mile Neighbourhood Radar Perimeter around User */}
          {userCoords && (
            <Circle
              center={userCoords}
              radius={3218.68}
              strokeColor="rgba(240, 90, 62, 0.45)"
              fillColor="rgba(240, 90, 62, 0.05)"
              strokeWidth={1.5}
            />
          )}

          {/* Community Alerts (200m Geo-Shield + Marker) */}
          {alerts.map((alert) => {
            const isMissing = alert.type === 'missing_alert' && alert.status !== 'safe';
            const isTnr = alert.type === 'tnr_colony';
            const strokeColor = isMissing
              ? 'rgba(239, 68, 68, 0.7)'
              : isTnr
              ? 'rgba(16, 185, 129, 0.7)'
              : 'rgba(245, 158, 11, 0.7)';
            const fillColor = isMissing
              ? 'rgba(239, 68, 68, 0.18)'
              : isTnr
              ? 'rgba(16, 185, 129, 0.18)'
              : 'rgba(245, 158, 11, 0.18)';
            const pinBg = isMissing ? '#ef4444' : isTnr ? '#10b981' : '#f59e0b';

            return (
              <React.Fragment key={alert.id}>
                <Circle
                  center={alert.coords}
                  radius={200}
                  strokeColor={strokeColor}
                  fillColor={fillColor}
                  strokeWidth={1.5}
                />
                <Marker
                  coordinate={alert.coords}
                  title={alert.title}
                  description={alert.subtitle}
                  onPress={() => onSelectSignal?.(alert)}
                >
                  <View style={[styles.markerBadge, { backgroundColor: pinBg }]}>
                    <Ionicons
                      name={isMissing ? 'warning' : isTnr ? 'shield-checkmark' : 'paw'}
                      size={13}
                      color="#ffffff"
                    />
                  </View>
                </Marker>
              </React.Fragment>
            );
          })}

          {/* Anonymous Sightings (200m Geo-Shield + Marker) */}
          {sightings.map((sighting) => {
            const targetCoords = sighting.jitteredCoords || sighting.coords;
            return (
              <React.Fragment key={sighting.id}>
                <Circle
                  center={targetCoords}
                  radius={200}
                  strokeColor="rgba(37, 99, 235, 0.7)"
                  fillColor="rgba(37, 99, 235, 0.16)"
                  strokeWidth={1.5}
                />
                <Marker
                  coordinate={targetCoords}
                  title={sighting.catNameHint || sighting.coatColour || 'Spotted Cat'}
                  description={sighting.approximateLocationName}
                  onPress={() => onSelectSignal?.(sighting)}
                >
                  <View style={[styles.markerBadge, { backgroundColor: '#2563eb' }]}>
                    <Ionicons name="eye" size={13} color="#ffffff" />
                  </View>
                </Marker>
              </React.Fragment>
            );
          })}
        </MapView>

        {/* Top Status Bar Overlay */}
        <View style={styles.topOverlay} pointerEvents="box-none">
          <View style={styles.locationChip}>
            <View style={styles.liveGreenDot} />
            <Text style={styles.locationChipText} numberOfLines={1}>
              {areaLabel}
            </Text>
          </View>

          <View style={styles.topRightActions}>
            <TouchableOpacity
              style={styles.iconActionBtn}
              onPress={() => centerOnUserLocation(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Center map on my location"
            >
              {locating ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Ionicons name="locate" size={17} color={Colors.primary} />
              )}
            </TouchableOpacity>

            {onExploreMap && (
              <TouchableOpacity
                style={styles.iconActionBtn}
                onPress={onExploreMap}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Open full screen map"
              >
                <Ionicons name="expand" size={17} color={Colors.textPrimary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Bottom Overlay Bar */}
        <View style={styles.bottomOverlay} pointerEvents="box-none">
          <View style={styles.privacyShieldPill} pointerEvents="none">
            <Ionicons name="shield-checkmark" size={12} color="#4f46e5" />
            <Text style={styles.privacyShieldText}>
              {activeSignalsCount === 0
                ? '200m Geo-Shield • All clear nearby'
                : `${activeSignalsCount} ${activeSignalsCount === 1 ? 'signal' : 'signals'} • 200m Geo-Shield`}
            </Text>
          </View>

          {onExploreMap && (
            <TouchableOpacity
              style={styles.expandMapPill}
              onPress={onExploreMap}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Full screen map and drop sighting pin"
            >
              <Ionicons name="map" size={12} color="#ffffff" />
              <Text style={styles.expandMapPillText}>Full Map & Drop Pin</Text>
              <Ionicons name="chevron-forward" size={12} color="#ffffff" />
            </TouchableOpacity>
          )}
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
  mapCard: {
    backgroundColor: '#e2e8f0',
    borderRadius: 20,
    height: 260,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  mapView: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  markerBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  topOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    maxWidth: '68%',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  liveGreenDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10b981',
  },
  locationChipText: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  privacyShieldPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e7ff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  privacyShieldText: {
    color: '#3730a3',
    fontSize: 10,
    fontWeight: '700',
  },
  expandMapPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primary,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  expandMapPillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
});
