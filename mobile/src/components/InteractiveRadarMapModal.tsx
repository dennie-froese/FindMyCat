import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ScrollView,
  Animated,
  Easing,
  ActivityIndicator,
  LayoutChangeEvent,
  GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { CommunityAlert, SightingReport } from '../types';
import {
  GeoCoordinates,
  DEFAULT_RADAR_CENTER,
  projectCoordsToRadar,
  canvasTapToCoords,
  getPrivacyShieldPixelRadius,
} from '../services/radarGeometry';
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
type MapStyleMode = 'street' | 'radar';

const RADIUS_OPTIONS = [0.5, 1.0, 2.0, 5.0];

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
  const [radiusMiles, setRadiusMiles] = useState<number>(initialRadiusMiles);
  const [mapMode, setMapMode] = useState<MapStyleMode>('street');
  const [filter, setFilter] = useState<MapFilterType>('all');

  // Center coordinates & user GPS state
  const [centerCoords, setCenterCoords] = useState<GeoCoordinates>(() => {
    const firstAlert = alerts.find((a) => a.coords);
    const firstSighting = sightings.find((s) => s.jitteredCoords || s.coords);
    return (
      firstAlert?.coords ||
      firstSighting?.jitteredCoords ||
      firstSighting?.coords ||
      DEFAULT_RADAR_CENTER
    );
  });
  const [userGpsCoords, setUserGpsCoords] = useState<GeoCoordinates | null>(null);
  const [centerLabel, setCenterLabel] = useState<string>('Local Neighbourhood Hub');
  const [locatingUser, setLocatingUser] = useState<boolean>(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  // Interactive selection & pin drop state
  const [selectedItem, setSelectedItem] = useState<CommunityAlert | SightingReport | null>(null);
  const [pinDropMode, setPinDropMode] = useState<boolean>(false);
  const [droppedPin, setDroppedPin] = useState<DroppedPinLocation | null>(null);
  const [canvasLayout, setCanvasLayout] = useState<{ width: number; height: number }>({
    width: 340,
    height: 360,
  });

  // Animated radar sweep
  const sweepAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      sweepAnim.setValue(0);
      const loop = Animated.loop(
        Animated.timing(sweepAnim, {
          toValue: 1,
          duration: 5000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      loop.start();
      return () => loop.stop();
    }
  }, [visible, sweepAnim]);

  const sweepRotation = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Resolve human-readable street/area label via reverse geocoding with graceful fallback
  const resolveCoordinateLabel = async (
    lat: number,
    lon: number,
    fallbackPrefix: string
  ): Promise<string> => {
    try {
      const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      if (places && places[0]) {
        const p = places[0];
        const parts = [p.street || p.name, p.district || p.subregion || p.city]
          .filter(Boolean)
          .slice(0, 2);
        if (parts.length > 0) {
          return `Near ${parts.join(', ')}`;
        }
      }
    } catch {
      // Reverse geocoding optional in simulator/offline
    }
    return `${fallbackPrefix} (${lat.toFixed(4)}°N, ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'})`;
  };

  // Live "Locate Me" handler
  const handleLocateMe = async () => {
    setLocatingUser(true);
    setLocationNotice(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const liveCoords = {
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        };
        setUserGpsCoords(liveCoords);
        setCenterCoords(liveCoords);
        const areaName = await resolveCoordinateLabel(
          liveCoords.latitude,
          liveCoords.longitude,
          'Live GPS Location'
        );
        setCenterLabel(`Live GPS • ${areaName}`);
        setLocationNotice('Centered on your live GPS coordinates.');
      } else {
        const fallback = alerts[0]?.coords || DEFAULT_RADAR_CENTER;
        setCenterCoords(fallback);
        setCenterLabel('Neighbourhood Sector Center (GPS Permission Off)');
        setLocationNotice('Location permission off — centered on active neighbourhood sector.');
      }
    } catch {
      const fallback = alerts[0]?.coords || DEFAULT_RADAR_CENTER;
      setCenterCoords(fallback);
      setCenterLabel('Victoria Park Sector Hub');
      setLocationNotice('Centered on active neighbourhood sector.');
    } finally {
      setLocatingUser(false);
    }
  };

  // Pan map center by cardinal step
  const handlePanStep = (dLatSign: number, dLonSign: number) => {
    const stepDegrees = (radiusMiles * 0.25) / 69.0;
    const nextLat = Number((centerCoords.latitude + dLatSign * stepDegrees).toFixed(6));
    const nextLon = Number((centerCoords.longitude + dLonSign * stepDegrees * 1.4).toFixed(6));
    setCenterCoords({ latitude: nextLat, longitude: nextLon });
    setCenterLabel(
      `Custom Sector (${nextLat.toFixed(4)}°N, ${Math.abs(nextLon).toFixed(4)}°${nextLon >= 0 ? 'E' : 'W'})`
    );
  };

  // Handle tap on map canvas to drop a sighting pin
  const handleCanvasPress = async (evt: GestureResponderEvent) => {
    const { locationX, locationY } = evt.nativeEvent;
    if (!canvasLayout.width || !canvasLayout.height) return;

    const nx = (locationX - canvasLayout.width / 2) / (canvasLayout.width / 2);
    const ny = (locationY - canvasLayout.height / 2) / (canvasLayout.height / 2);

    const tappedCoords = canvasTapToCoords(nx, ny, centerCoords, radiusMiles);
    setSelectedItem(null);

    const distFromCenter = calculateDistanceMiles(
      centerCoords.latitude,
      centerCoords.longitude,
      tappedCoords.latitude,
      tappedCoords.longitude
    );

    const initialLabel = `Pinned Location (~${distFromCenter} mi from center • ${tappedCoords.latitude.toFixed(4)}°N, ${Math.abs(tappedCoords.longitude).toFixed(4)}°W)`;
    setDroppedPin({
      latitude: tappedCoords.latitude,
      longitude: tappedCoords.longitude,
      label: initialLabel,
    });

    const resolvedLabel = await resolveCoordinateLabel(
      tappedCoords.latitude,
      tappedCoords.longitude,
      `Pinned Sector (~${distFromCenter} mi)`
    );
    setDroppedPin({
      latitude: tappedCoords.latitude,
      longitude: tappedCoords.longitude,
      label: resolvedLabel,
    });
  };

  const handleCanvasLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setCanvasLayout({ width, height });
    }
  };

  const filteredAlerts = alerts.filter((a) => {
    if (filter === 'all') return true;
    if (filter === 'alerts') return a.type === 'missing_alert';
    if (filter === 'tnr') return a.type === 'tnr_colony';
    return false;
  });

  const filteredSightings = sightings.filter(() => filter === 'all' || filter === 'sightings');

  const shieldRadiusPx = getPrivacyShieldPixelRadius(
    Math.min(canvasLayout.width, canvasLayout.height),
    radiusMiles
  );

  const droppedPinProjection = droppedPin
    ? projectCoordsToRadar(droppedPin, centerCoords, radiusMiles)
    : null;

  const userGpsProjection = userGpsCoords
    ? projectCoordsToRadar(userGpsCoords, centerCoords, radiusMiles)
    : null;

  const isSelectedAlert = selectedItem && 'type' in selectedItem;
  const selectedAlert = isSelectedAlert ? (selectedItem as CommunityAlert) : null;
  const selectedSighting =
    selectedItem && !isSelectedAlert ? (selectedItem as SightingReport) : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
        {/* Top Bar */}
        <View style={styles.headerBar}>
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <View style={styles.liveDot} />
              <Text style={styles.headerTitle}>Interactive Neighbourhood Map</Text>
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
            <Ionicons name="close" size={22} color="#f8fafc" />
          </TouchableOpacity>
        </View>

        {/* Filter & Mode Strip */}
        <View style={styles.controlsStrip}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            <TouchableOpacity
              style={[styles.filterPill, filter === 'all' && styles.filterPillActive]}
              onPress={() => setFilter('all')}
            >
              <Text style={[styles.filterPillText, filter === 'all' && styles.filterPillTextActive]}>
                All ({alerts.length + sightings.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, filter === 'alerts' && styles.filterPillActive]}
              onPress={() => setFilter('alerts')}
            >
              <Text style={[styles.filterPillText, filter === 'alerts' && styles.filterPillTextActive]}>
                🚨 Missing ({alerts.filter((a) => a.type === 'missing_alert').length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, filter === 'sightings' && styles.filterPillActive]}
              onPress={() => setFilter('sightings')}
            >
              <Text
                style={[styles.filterPillText, filter === 'sightings' && styles.filterPillTextActive]}
              >
                👀 Sightings ({sightings.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, filter === 'tnr' && styles.filterPillActive]}
              onPress={() => setFilter('tnr')}
            >
              <Text style={[styles.filterPillText, filter === 'tnr' && styles.filterPillTextActive]}>
                🏡 TNR ({alerts.filter((a) => a.type === 'tnr_colony').length})
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Interactive Map Viewport */}
        <View style={styles.mapWrapper} onLayout={handleCanvasLayout}>
          <TouchableOpacity
            activeOpacity={1}
            style={[
              styles.mapCanvas,
              mapMode === 'street' ? styles.mapCanvasStreet : styles.mapCanvasRadar,
            ]}
            onPress={handleCanvasPress}
            accessibilityRole="button"
            accessibilityLabel="Interactive radar map canvas. Tap anywhere to drop a sighting pin."
          >
            {/* Street Sector Grid & Topographic Styling */}
            {mapMode === 'street' && (
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                {/* Park & Green Belt Sector */}
                <View style={styles.parkZoneTopRight} />
                <View style={styles.parkZoneBottomLeft} />
                {/* Canal Waterway */}
                <View style={styles.canalWaterway} />
                {/* Major Neighbourhood Roads */}
                <View style={[styles.streetLineHorizontal, { top: '28%' }]} />
                <View style={[styles.streetLineHorizontal, { top: '52%', height: 3 }]} />
                <View style={[styles.streetLineHorizontal, { top: '76%' }]} />
                <View style={[styles.streetLineVertical, { left: '24%' }]} />
                <View style={[styles.streetLineVertical, { left: '50%', width: 3 }]} />
                <View style={[styles.streetLineVertical, { left: '78%' }]} />
                {/* Sector Labels */}
                <Text style={[styles.sectorWatermark, { top: '14%', left: '10%' }]}>
                  NW SECTOR • E8
                </Text>
                <Text style={[styles.sectorWatermark, { top: '18%', right: '10%' }]}>
                  VICTORIA PARK GREEN
                </Text>
                <Text style={[styles.sectorWatermark, { bottom: '18%', left: '10%' }]}>
                  REGENT’S CANAL BASIN
                </Text>
                <Text style={[styles.sectorWatermark, { bottom: '14%', right: '10%' }]}>
                  SE RESIDENTIAL • E9
                </Text>
              </View>
            )}

            {/* Concentric Distance Rings */}
            <View style={styles.ringOuter} pointerEvents="none">
              <Text style={styles.ringLabelTop}>{radiusMiles.toFixed(1)} mi</Text>
              <View style={styles.ringMid}>
                <Text style={styles.ringLabelTop}>{(radiusMiles * 0.5).toFixed(2)} mi</Text>
                <View style={styles.ringInner}>
                  <Text style={styles.ringLabelTop}>{(radiusMiles * 0.25).toFixed(2)} mi</Text>
                </View>
              </View>
            </View>

            {/* Rotating Radar Sweep Line */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.sweepContainer,
                {
                  transform: [{ rotate: sweepRotation }],
                },
              ]}
            >
              <View style={styles.sweepBeam} />
            </Animated.View>

            {/* Compass Cardinal Markers */}
            <Text style={[styles.compassLabel, { top: 10, alignSelf: 'center' }]}>N</Text>
            <Text style={[styles.compassLabel, { bottom: 10, alignSelf: 'center' }]}>S</Text>
            <Text style={[styles.compassLabel, { left: 10, top: '48%' }]}>W</Text>
            <Text style={[styles.compassLabel, { right: 10, top: '48%' }]}>E</Text>

            {/* Center Reticle / Active Hub */}
            <View style={styles.centerHubMarker} pointerEvents="none">
              <View style={styles.centerHubPulse} />
              <View style={styles.centerHubDot} />
            </View>

            {/* User Live GPS Marker (if distinct or active) */}
            {userGpsProjection && (
              <View
                pointerEvents="none"
                style={[
                  styles.pinWrapper,
                  {
                    left: `${userGpsProjection.leftPercent}%`,
                    top: `${userGpsProjection.topPercent}%`,
                  },
                ]}
              >
                <View style={styles.userGpsHalo} />
                <View style={styles.userGpsDot} />
                <View style={styles.userGpsTag}>
                  <Text style={styles.userGpsTagText}>YOU</Text>
                </View>
              </View>
            )}

            {/* Plotted Community Alerts */}
            {filteredAlerts.map((alert) => {
              const proj = projectCoordsToRadar(alert.coords, centerCoords, radiusMiles);
              const isSelected = selectedItem?.id === alert.id;
              const isMissing = alert.type === 'missing_alert' && alert.status !== 'safe';
              const isTnr = alert.type === 'tnr_colony';
              const pinColor = isMissing ? '#ef4444' : isTnr ? '#10b981' : '#f59e0b';

              return (
                <TouchableOpacity
                  key={alert.id}
                  activeOpacity={0.85}
                  onPress={() => {
                    setDroppedPin(null);
                    setSelectedItem(alert);
                  }}
                  style={[
                    styles.pinWrapper,
                    {
                      left: `${proj.leftPercent}%`,
                      top: `${proj.topPercent}%`,
                      zIndex: isSelected ? 30 : 10,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${alert.title}, ${proj.distanceMiles} miles away`}
                >
                  {/* 200m Geo-Shield Privacy Circle */}
                  <View
                    style={[
                      styles.geoShieldCircle,
                      {
                        width: shieldRadiusPx * 2,
                        height: shieldRadiusPx * 2,
                        borderRadius: shieldRadiusPx,
                        borderColor: pinColor,
                        backgroundColor:
                          isMissing
                            ? 'rgba(239, 68, 68, 0.16)'
                            : isTnr
                            ? 'rgba(16, 185, 129, 0.16)'
                            : 'rgba(245, 158, 11, 0.16)',
                      },
                    ]}
                  />

                  <View
                    style={[
                      styles.pinBadgeMarker,
                      { backgroundColor: pinColor },
                      isSelected && styles.pinBadgeMarkerSelected,
                    ]}
                  >
                    <Ionicons
                      name={isMissing ? 'warning' : isTnr ? 'shield-checkmark' : 'paw'}
                      size={13}
                      color="#ffffff"
                    />
                  </View>

                  <View
                    style={[
                      styles.pinLabelBubble,
                      { backgroundColor: pinColor },
                      isSelected && styles.pinLabelBubbleSelected,
                    ]}
                  >
                    <Text style={styles.pinLabelText} numberOfLines={1}>
                      {alert.petName || (isTnr ? 'TNR Colony' : 'Alert')} • {proj.distanceMiles}mi
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Plotted Anonymous Sightings */}
            {filteredSightings.map((sighting) => {
              const targetCoords = sighting.jitteredCoords || sighting.coords;
              const proj = projectCoordsToRadar(targetCoords, centerCoords, radiusMiles);
              const isSelected = selectedItem?.id === sighting.id;

              return (
                <TouchableOpacity
                  key={sighting.id}
                  activeOpacity={0.85}
                  onPress={() => {
                    setDroppedPin(null);
                    setSelectedItem(sighting);
                  }}
                  style={[
                    styles.pinWrapper,
                    {
                      left: `${proj.leftPercent}%`,
                      top: `${proj.topPercent}%`,
                      zIndex: isSelected ? 30 : 12,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Sighting: ${sighting.catNameHint || sighting.coatColour || 'Spotted Cat'}, ${proj.distanceMiles} miles away`}
                >
                  {/* 200m Geo-Shield Privacy Circle */}
                  <View
                    style={[
                      styles.geoShieldCircle,
                      {
                        width: shieldRadiusPx * 2,
                        height: shieldRadiusPx * 2,
                        borderRadius: shieldRadiusPx,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.16)',
                      },
                    ]}
                  />

                  <View
                    style={[
                      styles.pinBadgeMarker,
                      { backgroundColor: '#2563eb' },
                      isSelected && styles.pinBadgeMarkerSelected,
                    ]}
                  >
                    <Ionicons name="eye" size={13} color="#ffffff" />
                  </View>

                  <View
                    style={[
                      styles.pinLabelBubble,
                      { backgroundColor: '#1d4ed8' },
                      isSelected && styles.pinLabelBubbleSelected,
                    ]}
                  >
                    <Text style={styles.pinLabelText} numberOfLines={1}>
                      {sighting.catNameHint || sighting.coatColour || 'Sighting'} •{' '}
                      {proj.distanceMiles}mi
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Dropped Custom Sighting Pin */}
            {droppedPin && droppedPinProjection && (
              <View
                pointerEvents="none"
                style={[
                  styles.pinWrapper,
                  {
                    left: `${droppedPinProjection.leftPercent}%`,
                    top: `${droppedPinProjection.topPercent}%`,
                    zIndex: 40,
                  },
                ]}
              >
                <View
                  style={[
                    styles.geoShieldCircle,
                    {
                      width: shieldRadiusPx * 2,
                      height: shieldRadiusPx * 2,
                      borderRadius: shieldRadiusPx,
                      borderColor: Colors.primary,
                      backgroundColor: 'rgba(249, 115, 22, 0.22)',
                    },
                  ]}
                />
                <View style={styles.droppedPinMarker}>
                  <Ionicons name="location" size={18} color="#ffffff" />
                </View>
                <View style={styles.droppedPinLabel}>
                  <Text style={styles.droppedPinLabelText}>NEW SIGHTING PIN</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>

          {/* Floating Map Mode & Locate Me Controls (Top Right inside Map) */}
          <View style={styles.floatingRightControls}>
            <TouchableOpacity
              style={[styles.floatingBtn, locatingUser && styles.floatingBtnActive]}
              onPress={handleLocateMe}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Locate Me"
            >
              {locatingUser ? (
                <ActivityIndicator size="small" color="#38bdf8" />
              ) : (
                <Ionicons name="locate" size={18} color="#38bdf8" />
              )}
              <Text style={styles.floatingBtnText}>Locate Me</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.floatingBtn, pinDropMode && styles.floatingBtnDropActive]}
              onPress={() => setPinDropMode((prev) => !prev)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Drop Pin Mode"
            >
              <Ionicons
                name="pin"
                size={16}
                color={pinDropMode ? '#ffffff' : Colors.primary}
              />
              <Text
                style={[
                  styles.floatingBtnText,
                  pinDropMode && { color: '#ffffff' },
                ]}
              >
                {pinDropMode ? 'Tap Map to Pin' : 'Drop Pin'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.floatingBtn}
              onPress={() => setMapMode((m) => (m === 'street' ? 'radar' : 'street'))}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Toggle Map Style"
            >
              <Ionicons
                name={mapMode === 'street' ? 'radio-outline' : 'map-outline'}
                size={16}
                color="#cbd5e1"
              />
              <Text style={styles.floatingBtnText}>
                {mapMode === 'street' ? 'Radar View' : 'Street Grid'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Floating Directional Pan Controls (Bottom Left inside Map) */}
          <View style={styles.panPad}>
            <TouchableOpacity
              style={styles.panBtn}
              onPress={() => handlePanStep(1, 0)}
              accessibilityLabel="Pan North"
            >
              <Ionicons name="chevron-up" size={14} color="#cbd5e1" />
            </TouchableOpacity>
            <View style={styles.panMiddleRow}>
              <TouchableOpacity
                style={styles.panBtn}
                onPress={() => handlePanStep(0, -1)}
                accessibilityLabel="Pan West"
              >
                <Ionicons name="chevron-back" size={14} color="#cbd5e1" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.panCenterBtn}
                onPress={() => {
                  setCenterCoords(userGpsCoords || DEFAULT_RADAR_CENTER);
                  setCenterLabel(userGpsCoords ? 'Live GPS Center' : 'Local Neighbourhood Hub');
                }}
                accessibilityLabel="Reset Map Center"
              >
                <Ionicons name="contract-outline" size={12} color="#38bdf8" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.panBtn}
                onPress={() => handlePanStep(0, 1)}
                accessibilityLabel="Pan East"
              >
                <Ionicons name="chevron-forward" size={14} color="#cbd5e1" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.panBtn}
              onPress={() => handlePanStep(-1, 0)}
              accessibilityLabel="Pan South"
            >
              <Ionicons name="chevron-down" size={14} color="#cbd5e1" />
            </TouchableOpacity>
          </View>

          {/* Instruction Banner at Top Left of Map */}
          <View style={styles.mapHintPill} pointerEvents="none">
            <Ionicons name="finger-print-outline" size={12} color="#94a3b8" />
            <Text style={styles.mapHintText}>
              Tap any pin to inspect • Tap map to drop sighting pin
            </Text>
          </View>
        </View>

        {/* Radius Zoom Bar */}
        <View style={styles.zoomBar}>
          <View style={styles.zoomLabelGroup}>
            <Ionicons name="scan-circle-outline" size={16} color="#38bdf8" />
            <Text style={styles.zoomBarTitle}>SCAN RADIUS</Text>
          </View>
          <View style={styles.radiusButtonsRow}>
            {RADIUS_OPTIONS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.radiusBtn, radiusMiles === r && styles.radiusBtnActive]}
                onPress={() => setRadiusMiles(r)}
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

        {/* Optional Location Notice */}
        {locationNotice && (
          <View style={styles.noticeBanner}>
            <Ionicons name="checkmark-circle" size={14} color="#38bdf8" />
            <Text style={styles.noticeBannerText}>{locationNotice}</Text>
          </View>
        )}

        {/* Bottom Inspector / Action Sheet */}
        <View style={[styles.bottomInspector, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {droppedPin ? (
            <View style={styles.inspectorCard}>
              <View style={styles.inspectorTopRow}>
                <View style={styles.droppedPinBadge}>
                  <Ionicons name="location" size={12} color="#ffffff" />
                  <Text style={styles.droppedPinBadgeText}>CUSTOM SIGHTING PIN DROPPED</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setDroppedPin(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={20} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              <Text style={styles.inspectorTitle}>{droppedPin.label}</Text>
              <Text style={styles.inspectorSub}>
                Coordinates ({droppedPin.latitude.toFixed(4)}°N,{' '}
                {Math.abs(droppedPin.longitude).toFixed(4)}°W) will be automatically buffered by the
                200m Dual-Zone Privacy Shield.
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
                      <Ionicons name="close-circle" size={18} color="#94a3b8" />
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
                  <Ionicons name="information-circle-outline" size={17} color="#f8fafc" />
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
                              ? `Near ${selectedAlert.petName || 'Alert'} sector`
                              : selectedSighting?.approximateLocationName || 'Pinned Radar Sector',
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
                <Text style={styles.defaultFooterTitle}>
                  Spotted a cat in this area?
                </Text>
                <Text style={styles.defaultFooterSub}>
                  Tap anywhere on the map to drop a pin, or jump straight to the camera.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.quickDropCta}
                onPress={() => {
                  onClose();
                  onReportAtLocation(undefined, {
                    latitude: centerCoords.latitude,
                    longitude: centerCoords.longitude,
                    label: centerLabel,
                  });
                }}
              >
                <Ionicons name="add-circle" size={18} color="#ffffff" />
                <Text style={styles.quickDropCtaText}>Quick Report</Text>
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
    backgroundColor: '#090d16',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsStrip: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterPillActive: {
    backgroundColor: '#38bdf8',
    borderColor: '#38bdf8',
  },
  filterPillText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },
  filterPillTextActive: {
    color: '#090d16',
    fontWeight: '800',
  },
  mapWrapper: {
    flex: 1,
    margin: 12,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1e293b',
    position: 'relative',
  },
  mapCanvas: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  mapCanvasStreet: {
    backgroundColor: '#0f172a',
  },
  mapCanvasRadar: {
    backgroundColor: '#060a12',
  },
  parkZoneTopRight: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: '52%',
    height: '42%',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderBottomLeftRadius: 60,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.15)',
  },
  parkZoneBottomLeft: {
    position: 'absolute',
    bottom: -10,
    left: -10,
    width: '38%',
    height: '28%',
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    borderTopRightRadius: 48,
  },
  canalWaterway: {
    position: 'absolute',
    left: -20,
    right: -20,
    bottom: '28%',
    height: 14,
    backgroundColor: 'rgba(56, 189, 248, 0.14)',
    transform: [{ rotate: '-8deg' }],
  },
  streetLineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
  },
  streetLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1.5,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
  },
  sectorWatermark: {
    position: 'absolute',
    color: 'rgba(148, 163, 184, 0.28)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  ringOuter: {
    width: '84%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringMid: {
    width: '66%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: '46%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLabelTop: {
    position: 'absolute',
    top: 4,
    color: 'rgba(56, 189, 248, 0.65)',
    fontSize: 9,
    fontWeight: '700',
  },
  sweepContainer: {
    position: 'absolute',
    width: 280,
    height: 280,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  sweepBeam: {
    width: 2,
    height: 140,
    backgroundColor: 'rgba(56, 189, 248, 0.35)',
  },
  compassLabel: {
    position: 'absolute',
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
  },
  centerHubMarker: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerHubPulse: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(56, 189, 248, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.45)',
  },
  centerHubDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#38bdf8',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  pinWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -45 }, { translateY: -22 }],
    width: 90,
  },
  geoShieldCircle: {
    position: 'absolute',
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  pinBadgeMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  pinBadgeMarkerSelected: {
    transform: [{ scale: 1.2 }],
    borderColor: '#fde047',
    borderWidth: 2.5,
  },
  pinLabelBubble: {
    marginTop: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: 110,
  },
  pinLabelBubbleSelected: {
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  pinLabelText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  userGpsHalo: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(56, 189, 248, 0.25)',
  },
  userGpsDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#0284c7',
    borderWidth: 2.5,
    borderColor: '#ffffff',
  },
  userGpsTag: {
    marginTop: 2,
    backgroundColor: '#0284c7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  userGpsTagText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '800',
  },
  droppedPinMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#ffffff',
  },
  droppedPinLabel: {
    marginTop: 3,
    backgroundColor: Colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  droppedPinLabelText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '900',
  },
  floatingRightControls: {
    position: 'absolute',
    top: 12,
    right: 12,
    gap: 8,
  },
  floatingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  floatingBtnActive: {
    borderColor: '#38bdf8',
  },
  floatingBtnDropActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  floatingBtnText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '700',
  },
  panPad: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  panMiddleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  panBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
  },
  panCenterBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  mapHintPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
  },
  mapHintText: {
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '600',
  },
  zoomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1e293b',
  },
  zoomLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  zoomBarTitle: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  radiusButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  radiusBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  radiusBtnActive: {
    backgroundColor: '#38bdf8',
    borderColor: '#38bdf8',
  },
  radiusBtnText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
  },
  radiusBtnTextActive: {
    color: '#090d16',
    fontWeight: '800',
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  noticeBannerText: {
    color: '#bae6fd',
    fontSize: 11,
    fontWeight: '600',
  },
  bottomInspector: {
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: '#090d16',
  },
  inspectorCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
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
    backgroundColor: '#0f172a',
  },
  inspectorSignalBadge: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  inspectorTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
  },
  inspectorSub: {
    color: '#94a3b8',
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
    backgroundColor: '#0f172a',
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  secondaryDetailBtnText: {
    color: '#f8fafc',
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
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 12,
  },
  defaultFooterTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  defaultFooterSub: {
    color: '#94a3b8',
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
