import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import MapView, {
  Marker,
  Circle,
  Region,
  MapPressEvent,
  LongPressEvent,
  MapType,
} from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { CommunityAlert, SightingReport } from '../types';
import { GeoCoordinates, DEFAULT_RADAR_CENTER } from '../services/radarGeometry';
import { calculateDistanceMiles } from '../services/privacyEngine';

export interface DroppedPinLocation {
  latitude: number;
  longitude: number;
  label: string;
}

export interface InteractiveRadarMapModalProps {
  visible: boolean;
  onClose: () => void;
  alerts: CommunityAlert[];
  sightings: SightingReport[];
  initialRadiusMiles?: number;
  onSelectSignal: (signal: CommunityAlert | SightingReport) => void;
  onReportAtLocation: (prefillHint?: string, location?: DroppedPinLocation) => void;
}

type MapFilterType = 'all' | 'alerts' | 'sightings' | 'tnr';

const RADIUS_OPTIONS = [0.5, 1.0, 2.0, 5.0];

function radiusMilesToDelta(radiusMiles: number): number {
  // 1 degree latitude is ~69 miles; show diameter (2 * radius) with comfortable margin
  return Number(((radiusMiles * 2.3) / 69.0).toFixed(4));
}

export const InteractiveRadarMapModal: React.FC<InteractiveRadarMapModalProps> = ({
  visible,
  onClose,
  alerts,
  sightings,
  initialRadiusMiles = 2.0,
  onSelectSignal,
  onReportAtLocation,
}) => {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);

  const [radiusMiles, setRadiusMiles] = useState<number>(initialRadiusMiles);
  const [mapType, setMapType] = useState<MapType>('standard');
  const [filter, setFilter] = useState<MapFilterType>('all');

  const [userGpsCoords, setUserGpsCoords] = useState<GeoCoordinates | null>(null);
  const [region, setRegion] = useState<Region>({
    latitude: DEFAULT_RADAR_CENTER.latitude,
    longitude: DEFAULT_RADAR_CENTER.longitude,
    latitudeDelta: radiusMilesToDelta(initialRadiusMiles),
    longitudeDelta: radiusMilesToDelta(initialRadiusMiles),
  });
  const [centerLabel, setCenterLabel] = useState<string>('Acquiring live GPS location...');
  const [locatingUser, setLocatingUser] = useState<boolean>(false);

  // Interactive selection & pin drop state
  const [selectedItem, setSelectedItem] = useState<CommunityAlert | SightingReport | null>(null);
  const [pinDropMode, setPinDropMode] = useState<boolean>(false);
  const [droppedPin, setDroppedPin] = useState<DroppedPinLocation | null>(null);

  // Resolve human-readable street/area label via reverse geocoding
  const resolveCoordinateLabel = async (
    lat: number,
    lon: number,
    fallbackPrefix: string
  ): Promise<string> => {
    try {
      const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      if (places && places[0]) {
        const p = places[0];
        const parts = [p.street || p.name, p.district || p.subregion || p.city, p.postalCode]
          .filter(Boolean)
          .slice(0, 2);
        if (parts.length > 0) {
          return `Near ${parts.join(', ')}`;
        }
      }
    } catch {
      // Reverse geocoding optional
    }
    return `${fallbackPrefix} (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`;
  };

  // Live "Locate Me" handler — animates native MapView directly to user's real GPS
  const handleLocateMe = async () => {
    setLocatingUser(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setCenterLabel('Location permission off — enable GPS in Settings');
        setLocatingUser(false);
        return;
      }

      // Instant jump using cached position if available
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown?.coords) {
        const delta = radiusMilesToDelta(radiusMiles);
        const fastRegion: Region = {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
          latitudeDelta: delta,
          longitudeDelta: delta,
        };
        setUserGpsCoords({
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
        });
        setRegion(fastRegion);
        mapRef.current?.animateToRegion(fastRegion, 400);
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const liveCoords = {
        latitude: Number(pos.coords.latitude.toFixed(6)),
        longitude: Number(pos.coords.longitude.toFixed(6)),
      };
      setUserGpsCoords(liveCoords);

      const delta = radiusMilesToDelta(radiusMiles);
      const nextRegion: Region = {
        latitude: liveCoords.latitude,
        longitude: liveCoords.longitude,
        latitudeDelta: delta,
        longitudeDelta: delta,
      };
      setRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, 500);

      const areaName = await resolveCoordinateLabel(
        liveCoords.latitude,
        liveCoords.longitude,
        'Your Location'
      );
      setCenterLabel(areaName);
    } catch {
      setCenterLabel('Drag or pinch to explore map');
    } finally {
      setLocatingUser(false);
    }
  };

  // Automatically center on user's real GPS whenever the modal opens
  useEffect(() => {
    if (visible) {
      handleLocateMe();
    }
  }, [visible]);

  // Smoothly zoom in/out with +/- buttons
  const handleZoomByFactor = (factor: number) => {
    const nextLatDelta = Math.max(0.001, Math.min(2.0, region.latitudeDelta * factor));
    const nextLonDelta = Math.max(0.001, Math.min(2.0, region.longitudeDelta * factor));
    const nextRegion: Region = {
      ...region,
      latitudeDelta: nextLatDelta,
      longitudeDelta: nextLonDelta,
    };
    setRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 280);
  };

  // Change scan radius and animate camera zoom to fit
  const handleSelectRadius = (r: number) => {
    setRadiusMiles(r);
    const delta = radiusMilesToDelta(r);
    const targetCenter = userGpsCoords || {
      latitude: region.latitude,
      longitude: region.longitude,
    };
    const nextRegion: Region = {
      latitude: targetCenter.latitude,
      longitude: targetCenter.longitude,
      latitudeDelta: delta,
      longitudeDelta: delta,
    };
    setRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 350);
  };

  // Drop a sighting pin at a tapped or long-pressed map coordinate
  const placePinAtCoordinate = async (coord: GeoCoordinates) => {
    const lat = Number(coord.latitude.toFixed(6));
    const lon = Number(coord.longitude.toFixed(6));
    setSelectedItem(null);

    const refPoint = userGpsCoords || { latitude: region.latitude, longitude: region.longitude };
    const distMiles = calculateDistanceMiles(refPoint.latitude, refPoint.longitude, lat, lon);

    setDroppedPin({
      latitude: lat,
      longitude: lon,
      label: `Pinned Location (~${distMiles} mi away)`,
    });

    const resolvedLabel = await resolveCoordinateLabel(
      lat,
      lon,
      `Pinned Location (~${distMiles} mi)`
    );
    setDroppedPin({
      latitude: lat,
      longitude: lon,
      label: resolvedLabel,
    });
  };

  const handleMapPress = (e: MapPressEvent) => {
    if (pinDropMode && e.nativeEvent.coordinate) {
      placePinAtCoordinate(e.nativeEvent.coordinate);
      setPinDropMode(false);
    }
  };

  const handleMapLongPress = (e: LongPressEvent) => {
    if (e.nativeEvent.coordinate) {
      placePinAtCoordinate(e.nativeEvent.coordinate);
    }
  };

  const filteredAlerts = alerts.filter((a) => {
    if (filter === 'all') return true;
    if (filter === 'alerts') return a.type === 'missing_alert';
    if (filter === 'tnr') return a.type === 'tnr_colony';
    return false;
  });

  const filteredSightings = sightings.filter(() => filter === 'all' || filter === 'sightings');

  const isSelectedAlert = selectedItem && 'type' in selectedItem;
  const selectedAlert = isSelectedAlert ? (selectedItem as CommunityAlert) : null;
  const selectedSighting =
    selectedItem && !isSelectedAlert ? (selectedItem as SightingReport) : null;

  const refCenter = userGpsCoords || {
    latitude: region.latitude,
    longitude: region.longitude,
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Full-Screen Native MapView (Apple Maps / Google Maps) */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.mapView}
            initialRegion={region}
            mapType={mapType}
            onRegionChangeComplete={(nextRegion) => setRegion(nextRegion)}
            onPress={handleMapPress}
            onLongPress={handleMapLongPress}
            showsUserLocation={true}
            showsMyLocationButton={false}
            showsCompass={true}
            showsScale={true}
            scrollEnabled={true}
            zoomEnabled={true}
            pitchEnabled={true}
            rotateEnabled={true}
          >
            {/* Active Scan Radius Ring around User or Map Center */}
            <Circle
              center={refCenter}
              radius={radiusMiles * 1609.34}
              strokeColor="rgba(240, 90, 62, 0.55)"
              fillColor="rgba(240, 90, 62, 0.05)"
              strokeWidth={2}
            />

            {/* Plotted Community Alerts */}
            {filteredAlerts.map((alert) => {
              const isSelected = selectedItem?.id === alert.id;
              const isMissing = alert.type === 'missing_alert' && alert.status !== 'safe';
              const isTnr = alert.type === 'tnr_colony';
              const pinColor = isMissing ? '#ef4444' : isTnr ? '#10b981' : '#f59e0b';

              return (
                <React.Fragment key={alert.id}>
                  <Circle
                    center={alert.coords}
                    radius={200}
                    strokeColor={pinColor}
                    fillColor={
                      isMissing
                        ? 'rgba(239, 68, 68, 0.18)'
                        : isTnr
                        ? 'rgba(16, 185, 129, 0.18)'
                        : 'rgba(245, 158, 11, 0.18)'
                    }
                    strokeWidth={1.5}
                  />
                  <Marker
                    coordinate={alert.coords}
                    title={alert.title}
                    description={alert.subtitle}
                    onPress={() => {
                      setDroppedPin(null);
                      setSelectedItem(alert);
                    }}
                  >
                    <View
                      style={[
                        styles.markerPin,
                        { backgroundColor: pinColor },
                        isSelected && styles.markerPinSelected,
                      ]}
                    >
                      <Ionicons
                        name={isMissing ? 'warning' : isTnr ? 'shield-checkmark' : 'paw'}
                        size={15}
                        color="#ffffff"
                      />
                    </View>
                  </Marker>
                </React.Fragment>
              );
            })}

            {/* Plotted Sightings */}
            {filteredSightings.map((sighting) => {
              const targetCoords = sighting.jitteredCoords || sighting.coords;
              const isSelected = selectedItem?.id === sighting.id;

              return (
                <React.Fragment key={sighting.id}>
                  <Circle
                    center={targetCoords}
                    radius={200}
                    strokeColor="#2563eb"
                    fillColor="rgba(37, 99, 235, 0.18)"
                    strokeWidth={1.5}
                  />
                  <Marker
                    coordinate={targetCoords}
                    title={sighting.catNameHint || sighting.coatColour || 'Spotted Cat'}
                    description={sighting.approximateLocationName}
                    onPress={() => {
                      setDroppedPin(null);
                      setSelectedItem(sighting);
                    }}
                  >
                    <View
                      style={[
                        styles.markerPin,
                        { backgroundColor: '#2563eb' },
                        isSelected && styles.markerPinSelected,
                      ]}
                    >
                      <Ionicons name="eye" size={15} color="#ffffff" />
                    </View>
                  </Marker>
                </React.Fragment>
              );
            })}

            {/* Dropped Custom Sighting Pin */}
            {droppedPin && (
              <>
                <Circle
                  center={{
                    latitude: droppedPin.latitude,
                    longitude: droppedPin.longitude,
                  }}
                  radius={200}
                  strokeColor={Colors.primary}
                  fillColor="rgba(240, 90, 62, 0.22)"
                  strokeWidth={2}
                />
                <Marker
                  coordinate={{
                    latitude: droppedPin.latitude,
                    longitude: droppedPin.longitude,
                  }}
                  draggable
                  onDragEnd={(e) => {
                    if (e.nativeEvent.coordinate) {
                      placePinAtCoordinate(e.nativeEvent.coordinate);
                    }
                  }}
                  title="Pinned Sighting Location"
                  description="Hold & drag to adjust or tap Report below"
                >
                  <View style={styles.droppedPinMarker}>
                    <Ionicons name="location" size={20} color="#ffffff" />
                  </View>
                </Marker>
              </>
            )}
          </MapView>

          {/* Top Floating Header & Filter Chips */}
          <View
            style={[styles.topOverlayContainer, { paddingTop: Math.max(insets.top, 12) }]}
            pointerEvents="box-none"
          >
            <View style={styles.headerCard}>
              <View style={{ flex: 1 }}>
                <View style={styles.titleRow}>
                  <View style={styles.liveDot} />
                  <Text style={styles.headerTitle}>Neighbourhood Radar Map</Text>
                </View>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {centerLabel}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Close interactive map"
              >
                <Ionicons name="close" size={22} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Filter Chips Row */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              <TouchableOpacity
                style={[styles.filterPill, filter === 'all' && styles.filterPillActive]}
                onPress={() => setFilter('all')}
              >
                <Text
                  style={[styles.filterPillText, filter === 'all' && styles.filterPillTextActive]}
                >
                  All ({alerts.length + sightings.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterPill, filter === 'alerts' && styles.filterPillActive]}
                onPress={() => setFilter('alerts')}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    filter === 'alerts' && styles.filterPillTextActive,
                  ]}
                >
                  🚨 Missing ({alerts.filter((a) => a.type === 'missing_alert').length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterPill, filter === 'sightings' && styles.filterPillActive]}
                onPress={() => setFilter('sightings')}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    filter === 'sightings' && styles.filterPillTextActive,
                  ]}
                >
                  👀 Sightings ({sightings.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterPill, filter === 'tnr' && styles.filterPillActive]}
                onPress={() => setFilter('tnr')}
              >
                <Text
                  style={[styles.filterPillText, filter === 'tnr' && styles.filterPillTextActive]}
                >
                  🏡 TNR ({alerts.filter((a) => a.type === 'tnr_colony').length})
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Pin Drop Banner when active */}
            {pinDropMode && (
              <View style={styles.pinDropBanner}>
                <Ionicons name="location" size={15} color="#ffffff" />
                <Text style={styles.pinDropBannerText}>
                  Tap anywhere on the map to drop a sighting pin
                </Text>
              </View>
            )}
          </View>

          {/* Right-Side Map Controls (Locate Me, Pin Drop, Satellite, +/- Zoom) */}
          <View style={styles.rightControlsColumn} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.mapControlBtn}
              onPress={handleLocateMe}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Locate Me"
            >
              {locatingUser ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Ionicons name="locate" size={20} color={Colors.primary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.mapControlBtn, pinDropMode && styles.mapControlBtnActive]}
              onPress={() => setPinDropMode((prev) => !prev)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Drop Sighting Pin"
            >
              <Ionicons
                name="pin"
                size={19}
                color={pinDropMode ? '#ffffff' : Colors.textPrimary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.mapControlBtn}
              onPress={() =>
                setMapType((prev) => (prev === 'standard' ? 'hybrid' : 'standard'))
              }
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Toggle Satellite Map"
            >
              <Ionicons
                name={mapType === 'standard' ? 'earth-outline' : 'map-outline'}
                size={19}
                color={Colors.textPrimary}
              />
            </TouchableOpacity>

            <View style={styles.zoomStepper}>
              <TouchableOpacity
                style={styles.zoomStepBtn}
                onPress={() => handleZoomByFactor(0.5)}
                accessibilityRole="button"
                accessibilityLabel="Zoom In"
              >
                <Ionicons name="add" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
              <View style={styles.zoomStepDivider} />
              <TouchableOpacity
                style={styles.zoomStepBtn}
                onPress={() => handleZoomByFactor(2.0)}
                accessibilityRole="button"
                accessibilityLabel="Zoom Out"
              >
                <Ionicons name="remove" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Scan Radius Selector Bar */}
        <View style={styles.zoomBar}>
          <View style={styles.zoomLabelGroup}>
            <Ionicons name="scan-circle-outline" size={16} color={Colors.primary} />
            <Text style={styles.zoomBarTitle}>RADAR PERIMETER</Text>
          </View>
          <View style={styles.radiusButtonsRow}>
            {RADIUS_OPTIONS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.radiusBtn, radiusMiles === r && styles.radiusBtnActive]}
                onPress={() => handleSelectRadius(r)}
              >
                <Text
                  style={[
                    styles.radiusBtnText,
                    radiusMiles === r && styles.radiusBtnTextActive,
                  ]}
                >
                  {r} mi
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Bottom Inspector / Action Sheet */}
        <View style={[styles.bottomInspector, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {droppedPin ? (
            <View style={styles.inspectorCard}>
              <View style={styles.inspectorTopRow}>
                <View style={styles.droppedPinBadge}>
                  <Ionicons name="location" size={12} color="#ffffff" />
                  <Text style={styles.droppedPinBadgeText}>SIGHTING PIN DROPPED</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setDroppedPin(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>

              <Text style={styles.inspectorTitle}>{droppedPin.label}</Text>
              <Text style={styles.inspectorSub}>
                Exact pin ({droppedPin.latitude.toFixed(4)}°, {droppedPin.longitude.toFixed(4)}°)
                will be protected by the 200m Dual-Zone Privacy Shield.
              </Text>

              <View style={styles.inspectorActions}>
                <TouchableOpacity
                  style={styles.primaryReportBtn}
                  activeOpacity={0.85}
                  onPress={() => {
                    const pinToReport = droppedPin;
                    onClose();
                    onReportAtLocation(undefined, pinToReport);
                  }}
                >
                  <Ionicons name="camera" size={18} color="#ffffff" />
                  <Text style={styles.primaryReportBtnText}>Report Sighting at This Pin →</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : selectedItem ? (
            <View style={styles.inspectorCard}>
              <View style={styles.inspectorMainRow}>
                <Image
                  source={{
                    uri: selectedAlert ? selectedAlert.photoUrl : selectedSighting?.photoUri,
                  }}
                  style={styles.inspectorThumb}
                />
                <View style={{ flex: 1 }}>
                  <View style={styles.inspectorTopRow}>
                    <Text style={styles.inspectorSignalBadge}>
                      {selectedAlert ? selectedAlert.badgeText : 'ANONYMOUS SIGHTING'}
                    </Text>
                    <TouchableOpacity onPress={() => setSelectedItem(null)}>
                      <Ionicons name="close-circle" size={18} color="#64748b" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.inspectorTitle} numberOfLines={1}>
                    {selectedAlert
                      ? selectedAlert.title
                      : selectedSighting?.catNameHint ||
                        `${selectedSighting?.coatColour || 'Spotted'} Cat`}
                  </Text>
                  <Text style={styles.inspectorSub} numberOfLines={2}>
                    {selectedAlert ? selectedAlert.subtitle : selectedSighting?.notes}
                  </Text>
                </View>
              </View>

              <View style={styles.inspectorActions}>
                <TouchableOpacity
                  style={styles.secondaryDetailBtn}
                  onPress={() => {
                    const item = selectedItem;
                    onClose();
                    onSelectSignal(item);
                  }}
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={17}
                    color={Colors.textPrimary}
                  />
                  <Text style={styles.secondaryDetailBtnText}>Full Details</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.primaryReportBtn}
                  onPress={() => {
                    const hint = selectedAlert
                      ? selectedAlert.petName || selectedAlert.title.replace(/^Missing:\s*/i, '')
                      : selectedSighting?.catNameHint;
                    const coords = selectedAlert
                      ? selectedAlert.coords
                      : selectedSighting?.jitteredCoords || selectedSighting?.coords;
                    onClose();
                    onReportAtLocation(
                      hint,
                      coords
                        ? {
                            latitude: coords.latitude,
                            longitude: coords.longitude,
                            label: selectedAlert
                              ? `Near ${selectedAlert.petName || 'Alert'} area`
                              : selectedSighting?.approximateLocationName || 'Pinned Map Area',
                          }
                        : undefined
                    );
                  }}
                >
                  <Ionicons name="camera" size={17} color="#ffffff" />
                  <Text style={styles.primaryReportBtnText}>I Spotted This Cat</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.defaultFooterCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.defaultFooterTitle}>Spotted a cat on this map?</Text>
                <Text style={styles.defaultFooterSub}>
                  Long-press anywhere on the map to drop a pin, or tap Drop Pin.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.quickDropCta}
                onPress={() => {
                  const target = userGpsCoords || {
                    latitude: region.latitude,
                    longitude: region.longitude,
                  };
                  placePinAtCoordinate(target);
                }}
              >
                <Ionicons name="location" size={17} color="#ffffff" />
                <Text style={styles.quickDropCtaText}>Drop Pin Here</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  mapView: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  topOverlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    gap: 8,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: {
    paddingHorizontal: 14,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  filterPillActive: {
    backgroundColor: Colors.textPrimary,
    borderColor: Colors.textPrimary,
  },
  filterPillText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  filterPillTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  pinDropBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  pinDropBannerText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  rightControlsColumn: {
    position: 'absolute',
    right: 14,
    bottom: 20,
    gap: 10,
    alignItems: 'center',
  },
  mapControlBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  mapControlBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  zoomStepper: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  zoomStepBtn: {
    width: 44,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomStepDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
  },
  markerPin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  markerPinSelected: {
    transform: [{ scale: 1.2 }],
    borderColor: '#fde047',
  },
  droppedPinMarker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 5,
  },
  zoomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  zoomLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  zoomBarTitle: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  radiusButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  radiusBtn: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  radiusBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  radiusBtnText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  radiusBtnTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  bottomInspector: {
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: Colors.surface,
  },
  inspectorCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  inspectorTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  droppedPinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  droppedPinBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  inspectorMainRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  inspectorThumb: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
  },
  inspectorSignalBadge: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  inspectorTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  inspectorSub: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  inspectorActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryDetailBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  secondaryDetailBtnText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  primaryReportBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: 11,
    borderRadius: 12,
  },
  primaryReportBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  defaultFooterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  defaultFooterTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  defaultFooterSub: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  quickDropCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  quickDropCtaText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
});
