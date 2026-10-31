import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { SightingReport } from '../types';
import { applyPrivacyShield } from '../services/privacyEngine';

interface QuickReportScreenProps {
  onSubmitSighting: (report: SightingReport) => void;
  onCancel: () => void;
  initialCatHint?: string;
}

const COAT_PRESETS = ['Ginger / Orange', 'Tuxedo (B&W)', 'Tabby (Striped)', 'All Black', 'Calico / Tortie', 'White / Grey'];
const BEHAVIOUR_PRESETS = ['Resting / Healthy', 'Hiding / Timid', 'Vocal / Hungry', 'Approached me', 'Appeared injured'];

export const QuickReportScreen: React.FC<QuickReportScreenProps> = ({
  onSubmitSighting,
  onCancel,
  initialCatHint,
}) => {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [locationName, setLocationName] = useState('Detecting current location...');
  const [manualLocationText, setManualLocationText] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationAvailable, setLocationAvailable] = useState<boolean | null>(null);
  const [hasExifGps, setHasExifGps] = useState(false);
  const [privacyShieldActive, setPrivacyShieldActive] = useState(true);
  const [selectedCoat, setSelectedCoat] = useState<string>(COAT_PRESETS[0]);
  const [selectedBehaviour, setSelectedBehaviour] = useState<string>(BEHAVIOUR_PRESETS[0]);
  const [hasCollar, setHasCollar] = useState(false);
  const [collarNotes, setCollarNotes] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Pick or Capture Photo
  const handleCapturePhoto = async (useCamera: boolean) => {
    try {
      setLoadingMedia(true);
      let result;
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Needed', 'Camera access is required to photograph spotted cats.');
          setLoadingMedia(false);
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          quality: 0.8,
          exif: true,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Needed', 'Photo library access is required to select photos.');
          setLoadingMedia(false);
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          exif: true,
        });
      }

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setPhotoUri(asset.uri);

        // Check for EXIF GPS metadata
        if (asset.exif && asset.exif.GPSLatitude && asset.exif.GPSLongitude) {
          const lat = Number(asset.exif.GPSLatitude);
          const lon = Number(asset.exif.GPSLongitude);
          setCoords({ latitude: lat, longitude: lon });
          setLocationAvailable(true);
          setHasExifGps(true);
          await resolveAreaLabel(lat, lon, 'Photo EXIF location acquired');
        } else if (!coords) {
          fetchCurrentDeviceLocation();
        }
      }
    } catch (err) {
      console.warn('Image capture error:', err);
      Alert.alert(
        'Camera Unavailable',
        useCamera
          ? 'Could not open the camera on this device. Please try uploading a photo from your library instead.'
          : 'Could not open the photo library. Please check permissions and try again.'
      );
    } finally {
      setLoadingMedia(false);
    }
  };

  const resolveAreaLabel = async (lat: number, lon: number, fallbackLabel: string) => {
    try {
      const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      if (places && places[0]) {
        const p = places[0];
        const parts = [p.street || p.name, p.district || p.subregion || p.city, p.postalCode]
          .filter(Boolean)
          .slice(0, 2);
        if (parts.length > 0) {
          setLocationName(`Near ${parts.join(', ')}`);
          return;
        }
      }
    } catch {
      // Reverse geocoding optional
    }
    setLocationName(fallbackLabel);
  };

  const fetchCurrentDeviceLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        const lat = loc.coords.latitude;
        const lon = loc.coords.longitude;
        setCoords({ latitude: lat, longitude: lon });
        setLocationAvailable(true);
        await resolveAreaLabel(lat, lon, 'Current GPS location acquired (200m buffered)');
      } else {
        setLocationAvailable(false);
        setLocationName('GPS permission off — enter street or area below');
      }
    } catch {
      setLocationAvailable(false);
      setLocationName('GPS unavailable — enter street or area below');
    }
  };

  useEffect(() => {
    fetchCurrentDeviceLocation();
  }, []);

  const handleSubmit = () => {
    if (!photoUri) {
      Alert.alert('Photo Required', 'Please take or choose a photo of the spotted cat.');
      return;
    }

    const finalLocationLabel = manualLocationText.trim() || (coords ? locationName : '');
    if (!finalLocationLabel) {
      Alert.alert(
        'Location Needed',
        'Please enable location access or enter the street / neighbourhood where you spotted the cat.'
      );
      return;
    }

    setSubmitting(true);

    const baseCoords = coords || { latitude: 0, longitude: 0 };
    const jittered =
      coords && privacyShieldActive
        ? applyPrivacyShield(baseCoords.latitude, baseCoords.longitude)
        : { latitude: baseCoords.latitude, longitude: baseCoords.longitude, offsetMeters: 0 };

    const newReport: SightingReport = {
      id: `sighting-${Date.now()}`,
      catNameHint: initialCatHint || undefined,
      photoUri,
      timestamp: new Date().toISOString(),
      reportedAtDisplay: 'Just now',
      coords: baseCoords,
      jitteredCoords: {
        latitude: jittered.latitude,
        longitude: jittered.longitude,
      },
      approximateLocationName: finalLocationLabel,
      coatColour: selectedCoat,
      coatColor: selectedCoat,
      collarDescription: hasCollar ? collarNotes || 'Collar observed' : 'No collar visible',
      notes: `${selectedBehaviour}. ${additionalNotes}`.trim(),
      isAnonymous: true,
      status: 'unverified',
    };

    setTimeout(() => {
      setSubmitting(false);
      onSubmitSighting(newReport);
    }, 400);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Active Alert Matching Banner */}
      {initialCatHint && (
        <View style={styles.matchingBanner}>
          <Ionicons name="link" size={18} color="#0284c7" />
          <View style={styles.matchingTextContainer}>
            <Text style={styles.matchingTitle}>LINKED TO ACTIVE ALERT</Text>
            <Text style={styles.matchingDesc}>
              Reporting potential match for: <Text style={styles.matchingCatName}>{initialCatHint}</Text>
            </Text>
          </View>
        </View>
      )}

      {/* Zero Auth Trust Callout */}
      <View style={styles.anonBanner}>
        <Ionicons name="flash" size={20} color="#b45309" />
        <View style={styles.anonTextContainer}>
          <Text style={styles.anonTitle}>Zero-Friction Anonymous Sighting</Text>
          <Text style={styles.anonDesc}>
            No sign-up or phone number required. Your sighting is timestamped and broadcasted in seconds.
          </Text>
        </View>
      </View>

      {/* Photo Capture Section */}
      <Text style={styles.sectionTitle}>1. Cat Photograph</Text>
      {photoUri ? (
        <View style={styles.photoPreviewWrapper}>
          <Image source={{ uri: photoUri }} style={styles.photoPreview} />
          <View style={styles.photoActionOverlayRow}>
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={() => handleCapturePhoto(true)}
              accessibilityRole="button"
              accessibilityLabel="Retake photo with camera"
            >
              <Text style={styles.retakeText}>Retake Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={() => handleCapturePhoto(false)}
              accessibilityRole="button"
              accessibilityLabel="Choose a different photo from library"
            >
              <Text style={styles.retakeText}>Choose Library</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.photoButtonRow}>
          <TouchableOpacity
            style={styles.captureButtonPrimary}
            onPress={() => handleCapturePhoto(true)}
            disabled={loadingMedia}
          >
            {loadingMedia ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Ionicons name="camera" size={26} color="#ffffff" style={{ marginBottom: 4 }} />
                <Text style={styles.captureTextPrimary}>Take Photo Now</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.captureButtonSecondary}
            onPress={() => handleCapturePhoto(false)}
            disabled={loadingMedia}
          >
            <Ionicons name="images-outline" size={26} color={Colors.textSecondary} style={{ marginBottom: 4 }} />
            <Text style={styles.captureTextSecondary}>Upload Library</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Geotag & Privacy Section */}
      <Text style={styles.sectionTitle}>2. Location & Privacy Shield</Text>
      <View style={styles.card}>
        <View style={styles.locationHeader}>
          <Ionicons name="location" size={20} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.locationLabel}>Sighting Geotag</Text>
            <Text style={styles.locationVal}>{locationName}</Text>
            {hasExifGps && (
              <Text style={styles.exifBadge}>✓ EXIF GPS auto-extracted from photo</Text>
            )}
          </View>
        </View>

        <TextInput
          style={[styles.textInput, { marginTop: 10 }]}
          placeholder={
            locationAvailable === false
              ? 'Enter street, park, or postcode (required)...'
              : 'Optional: add street or landmark name (e.g. Near St. Mark’s Gate)'
          }
          value={manualLocationText}
          onChangeText={setManualLocationText}
          placeholderTextColor={Colors.textMuted}
        />

        <View style={styles.divider} />

        <View style={styles.switchRow}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.switchTitle}>Dual-Zone Privacy Shield (200m)</Text>
            <Text style={styles.switchDesc}>
              Masks exact pin with a randomized 200m radius buffer before saving to protect private residences.
            </Text>
          </View>
          <Switch
            value={privacyShieldActive}
            onValueChange={setPrivacyShieldActive}
            trackColor={{ false: '#cbd5e1', true: Colors.primary }}
          />
        </View>
      </View>

      {/* Quick Appearance Tags */}
      <Text style={styles.sectionTitle}>3. Coat Colour & Markings</Text>
      <View style={styles.chipsWrap}>
        {COAT_PRESETS.map((coat) => (
          <TouchableOpacity
            key={coat}
            style={[styles.tagChip, selectedCoat === coat && styles.tagChipActive]}
            onPress={() => setSelectedCoat(coat)}
          >
            <Text
              style={[
                styles.tagChipText,
                selectedCoat === coat && styles.tagChipTextActive,
              ]}
            >
              {coat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Behaviour Tags */}
      <Text style={styles.sectionTitle}>4. Behaviour & Condition</Text>
      <View style={styles.chipsWrap}>
        {BEHAVIOUR_PRESETS.map((beh) => (
          <TouchableOpacity
            key={beh}
            style={[styles.tagChip, selectedBehaviour === beh && styles.tagChipActive]}
            onPress={() => setSelectedBehaviour(beh)}
          >
            <Text
              style={[
                styles.tagChipText,
                selectedBehaviour === beh && styles.tagChipTextActive,
              ]}
            >
              {beh}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Collar Toggle */}
      <View style={[styles.card, { marginTop: 12 }]}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Did the cat have a collar?</Text>
            <Text style={styles.switchDesc}>Helps differentiate owned pets from strays</Text>
          </View>
          <Switch
            value={hasCollar}
            onValueChange={setHasCollar}
            trackColor={{ false: '#cbd5e1', true: Colors.primary }}
          />
        </View>

        {hasCollar && (
          <TextInput
            style={styles.textInput}
            placeholder="Collar colour, bell, or tag description..."
            value={collarNotes}
            onChangeText={setCollarNotes}
          />
        )}
      </View>

      {/* Notes */}
      <Text style={styles.sectionTitle}>5. Additional Clues</Text>
      <TextInput
        style={[styles.textInput, { height: 80, textAlignVertical: 'top' }]}
        placeholder="e.g. Hiding under red car, appeared friendly, ear tipped..."
        multiline
        value={additionalNotes}
        onChangeText={setAdditionalNotes}
      />

      {/* Action Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.submitBtn}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.submitBtnText}>Post Anonymous Sighting</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  matchingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    gap: 8,
  },
  matchingTextContainer: {
    flex: 1,
  },
  matchingTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0369a1',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  matchingDesc: {
    fontSize: 13,
    color: '#0c4a6e',
  },
  matchingCatName: {
    fontWeight: '800',
    color: '#0284c7',
  },
  anonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  anonIcon: {
    fontSize: 22,
  },
  anonTextContainer: {
    flex: 1,
  },
  anonTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#b45309',
  },
  anonDesc: {
    fontSize: 12,
    color: '#92400e',
    marginTop: 2,
    lineHeight: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  photoButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  captureButtonPrimary: {
    flex: 1.2,
    backgroundColor: Colors.primary,
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  captureIcon: {
    fontSize: 26,
    marginBottom: 4,
  },
  captureTextPrimary: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  captureButtonSecondary: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureIconSecondary: {
    fontSize: 24,
    marginBottom: 4,
  },
  captureTextSecondary: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  photoPreviewWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.border,
    position: 'relative',
  },
  photoPreview: {
    width: '100%',
    height: 220,
    backgroundColor: '#f1f5f9',
  },
  photoActionOverlayRow: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
  },
  retakeButton: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retakeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  locationIcon: {
    fontSize: 20,
  },
  locationLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  locationVal: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 1,
  },
  exifBadge: {
    fontSize: 11,
    color: Colors.success,
    fontWeight: '600',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  switchDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  tagChipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  tagChipText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  tagChipTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  textInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: Colors.textPrimary,
    marginTop: 6,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  submitBtn: {
    flex: 2,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
});
