import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../theme/colors';
import { CatProfile, UserRole } from '../types';
import { requestNotificationPermissions } from '../services/reminderService';

interface OnboardingScreenProps {
  onComplete: (data: { createdCat?: CatProfile; role: UserRole }) => void;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1543852786-1cf6624b9987?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&auto=format&fit=crop&q=80',
];

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [role, setRole] = useState<UserRole>('guardian');

  // Cat registration state (Step 3 for Guardians)
  const [catName, setCatName] = useState('');
  const [catBreed, setCatBreed] = useState('Domestic Shorthair');
  const [coatColour, setCoatColour] = useState('');
  const [microchipNumber, setMicrochipNumber] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  // A real photo of the guardian's own cat (strongly preferred for lost posters)
  const [customPhotoUri, setCustomPhotoUri] = useState<string | null>(null);

  // Spotter state (Step 3 for Spotters)
  const [neighborhoodZone, setNeighborhoodZone] = useState('');

  const handlePickOwnPhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Needed', 'Photo library access is required to choose a photo of your cat.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.[0]) {
        setCustomPhotoUri(result.assets[0].uri);
      }
    } catch (err) {
      console.warn('Photo picker error:', err);
      Alert.alert('Photo Unavailable', 'We couldn’t open your photo library. You can add a photo later from the Passport tab.');
    }
  };

  const handleNextFromWelcome = () => setStep(2);

  const handleSelectRole = (selectedRole: UserRole) => {
    setRole(selectedRole);
    setStep(3);
  };

  const handleSaveCatStep = () => {
    if (!catName.trim() && role === 'guardian') {
      Alert.alert(
        'Cat Name Required',
        'Please enter your cat’s name, or skip for now and add your cat later from the Passport tab.',
        [
          { text: 'Enter Name', style: 'cancel' },
          {
            text: 'Skip for Now',
            onPress: () => setStep(4),
          },
        ]
      );
      return;
    }
    if (role === 'guardian' && emergencyPhone.replace(/[^0-9]/g, '').length < 7) {
      Alert.alert(
        'Contact Number Required',
        'Please enter a phone number neighbours can call if they find your cat. It is printed on your lost poster.'
      );
      return;
    }
    setStep(4);
  };

  const handleFinishOnboarding = async (requestPermissions: boolean) => {
    if (requestPermissions) {
      try {
        await Location.requestForegroundPermissionsAsync();
      } catch (err) {
        console.warn('Location request fallback:', err);
      }

      try {
        await requestNotificationPermissions();
      } catch (err) {
        console.warn('Notification request fallback:', err);
      }
    }

    let createdCat: CatProfile | undefined;

    if (role === 'guardian' && catName.trim()) {
      // Only persist what the guardian actually told us. Unknown fields stay empty
      // so the passport and lost poster never show fabricated details.
      createdCat = {
        id: `cat-${Date.now()}`,
        name: catName.trim(),
        breed: catBreed.trim() || 'Domestic Shorthair',
        coatColour: coatColour.trim(),
        coatColor: coatColour.trim(),
        distinctiveFeatures: '',
        microchipNumber: microchipNumber.replace(/\s+/g, ''),
        photoUrl: customPhotoUri || PRESET_AVATARS[selectedPhotoIndex],
        status: 'safe',
        emergencyPhone: emergencyPhone.trim(),
        vaccinations: [],
      };
    }

    onComplete({
      createdCat,
      role,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Progress Indicator */}
        <View style={styles.progressBarContainer}>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[
                styles.progressDot,
                step >= i ? styles.progressDotActive : styles.progressDotInactive,
              ]}
            />
          ))}
        </View>

        {/* STEP 1: WELCOME & PRIVACY ENGINE */}
        {step === 1 && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroEmoji}>🐱</Text>
            </View>

            <Text style={styles.mainTitle}>Find My Cat</Text>
            <Text style={styles.tagline}>
              Community-Powered Lost Feline Recovery with Zero-Friction Sightings & Digital Pet Passports
            </Text>

            <View style={styles.featuresList}>
              <View style={styles.featureItem}>
                <View style={styles.featureIconCircle}>
                  <Ionicons name="camera" size={20} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>1-Tap Anonymous Sightings</Text>
                  <Text style={styles.featureDesc}>
                    Neighbors and passersby report roaming cats instantly without accounts or forms.
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <View style={styles.featureIconCircle}>
                  <Ionicons name="shield-checkmark" size={20} color={Colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>200m Privacy Shield</Text>
                  <Text style={styles.featureDesc}>
                    Differential geo-jittering offsets exact coordinates so residential addresses remain confidential.
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <View style={styles.featureIconCircle}>
                  <Ionicons name="document-text" size={20} color="#0284c7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>Smart Lost Flyers & QR Codes</Text>
                  <Text style={styles.featureDesc}>
                    Instantly generate print-ready A4 posters embedded with dynamic QR sighting links.
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={handleNextFromWelcome}>
              <Text style={styles.primaryBtnText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={18} color="#ffffff" />
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* STEP 2: ROLE SELECTION */}
        {step === 2 && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.stepTitle}>Choose Your Primary Role</Text>
            <Text style={styles.stepSubtitle}>
              Tailor Find My Cat to what matters most to you. You can change this anytime.
            </Text>

            <View style={styles.rolesContainer}>
              <TouchableOpacity
                style={[
                  styles.roleCard,
                  role === 'guardian' && styles.roleCardActive,
                ]}
                onPress={() => handleSelectRole('guardian')}
                activeOpacity={0.8}
              >
                <View style={styles.roleHeaderRow}>
                  <View style={styles.roleIconCircle}>
                    <Ionicons name="paw" size={24} color={Colors.primary} />
                  </View>
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>RECOMMENDED</Text>
                  </View>
                </View>
                <Text style={styles.roleTitle}>Cat Parent / Guardian</Text>
                <Text style={styles.roleDesc}>
                  I have one or more cats and want a digital passport vault, automated 7-day booster reminders, and 2-mile emergency Amber Alerts.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleCard,
                  role === 'spotter' && styles.roleCardActive,
                ]}
                onPress={() => handleSelectRole('spotter')}
                activeOpacity={0.8}
              >
                <View style={styles.roleHeaderRow}>
                  <View style={[styles.roleIconCircle, { backgroundColor: '#ecfdf5' }]}>
                    <Ionicons name="eye" size={24} color={Colors.success} />
                  </View>
                  <View style={[styles.roleBadge, { backgroundColor: '#ecfdf5' }]}>
                    <Text style={[styles.roleBadgeText, { color: Colors.success }]}>COMMUNITY</Text>
                  </View>
                </View>
                <Text style={styles.roleTitle}>Neighborhood Lookout / Spotter</Text>
                <Text style={styles.roleDesc}>
                  I love animals and want to keep an eye out for missing cats, log anonymous roaming sightings, and help monitor local community cat colonies.
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.backLink}
              onPress={() => setStep(1)}
            >
              <Ionicons name="arrow-back" size={16} color={Colors.textMuted} />
              <Text style={styles.backLinkText}>Back</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* STEP 3: CONTEXT-AWARE SETUP */}
        {step === 3 && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {role === 'guardian' ? (
              <>
                <Text style={styles.stepTitle}>Create Your Cat's Passport</Text>
                <Text style={styles.stepSubtitle}>
                  Register your feline in the digital health vault for instant medical notes & recovery tools.
                </Text>

                {/* Avatar Presets */}
                <Text style={styles.inputLabel}>Photo of Your Cat</Text>
                <View style={styles.avatarRow}>
                  <TouchableOpacity
                    onPress={handlePickOwnPhoto}
                    style={[
                      styles.avatarOption,
                      styles.avatarOptionOwn,
                      customPhotoUri !== null && styles.avatarOptionSelected,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={customPhotoUri ? 'Change photo of your cat' : 'Choose a photo of your cat'}
                  >
                    {customPhotoUri ? (
                      <>
                        <Image source={{ uri: customPhotoUri }} style={styles.avatarImage} />
                        <View style={styles.avatarCheck}>
                          <Ionicons name="checkmark" size={12} color="#ffffff" />
                        </View>
                      </>
                    ) : (
                      <Ionicons name="camera" size={22} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                  {PRESET_AVATARS.map((uri, idx) => {
                    const isSelected = customPhotoUri === null && selectedPhotoIndex === idx;
                    return (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => {
                          setCustomPhotoUri(null);
                          setSelectedPhotoIndex(idx);
                        }}
                        style={[styles.avatarOption, isSelected && styles.avatarOptionSelected]}
                        accessibilityRole="button"
                        accessibilityLabel={`Placeholder avatar ${idx + 1}`}
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Image source={{ uri }} style={styles.avatarImage} />
                        {isSelected && (
                          <View style={styles.avatarCheck}>
                            <Ionicons name="checkmark" size={12} color="#ffffff" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.photoHint}>
                  A real photo helps neighbours recognise your cat. Placeholder avatars can be replaced later.
                </Text>

                {/* Cat Name */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Cat's Name *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Cleo, Milo, Jasper"
                    value={catName}
                    onChangeText={setCatName}
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>

                {/* Breed & Coat */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Breed</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. British Shorthair, Tuxedo"
                    value={catBreed}
                    onChangeText={setCatBreed}
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Coat Colour & Markings</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Ginger tabby with white bib"
                    value={coatColour}
                    onChangeText={setCoatColour}
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>

                {/* Emergency Contact */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Your Contact Phone *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Printed on lost posters, e.g. 07700 900000"
                    value={emergencyPhone}
                    onChangeText={setEmergencyPhone}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>

                {/* Microchip */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Microchip Number (Optional)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="15 digits, from your vet or chip paperwork"
                    value={microchipNumber}
                    onChangeText={setMicrochipNumber}
                    keyboardType="numeric"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>

                <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveCatStep}>
                  <Text style={styles.primaryBtnText}>Save Passport & Continue</Text>
                  <Ionicons name="arrow-forward" size={18} color="#ffffff" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.skipBtn}
                  onPress={() => setStep(4)}
                >
                  <Text style={styles.skipBtnText}>Skip for now, add my cat later</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.stepTitle}>Neighborhood Lookout Radar</Text>
                <Text style={styles.stepSubtitle}>
                  Set your local observation territory so the radar focuses on cats reported lost in your area.
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Your Primary Neighbourhood / Borough</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Victoria Park, Hackney, Islington"
                    value={neighborhoodZone}
                    onChangeText={setNeighborhoodZone}
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>

                <View style={styles.spotterTipBox}>
                  <Ionicons name="information-circle" size={20} color={Colors.primary} />
                  <Text style={styles.spotterTipText}>
                    As a community lookout, you will see real-time lost alerts, safe TNR colonies, and can log 1-tap sightings if you spot an unfamiliar cat.
                  </Text>
                </View>

                <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep(4)}>
                  <Text style={styles.primaryBtnText}>Continue to Permissions</Text>
                  <Ionicons name="arrow-forward" size={18} color="#ffffff" />
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.backLink} onPress={() => setStep(2)}>
              <Ionicons name="arrow-back" size={16} color={Colors.textMuted} />
              <Text style={styles.backLinkText}>Back</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* STEP 4: SOFT PERMISSIONS PRIME */}
        {step === 4 && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.heroBadge}>
              <Ionicons name="notifications" size={32} color={Colors.primary} />
            </View>

            <Text style={styles.stepTitle}>Enable Neighborhood Safety</Text>
            <Text style={styles.stepSubtitle}>
              Two permissions make Find My Cat effective while strictly preserving your residential privacy.
            </Text>

            <View style={styles.permissionCard}>
              <View style={styles.permissionIconCircle}>
                <Ionicons name="location" size={22} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.permissionTitle}>📍 Location Access</Text>
                <Text style={styles.permissionDesc}>
                  Used to center the live 2-mile radar and calculate sighting distances. Your home address is always protected by the 200m Privacy Shield.
                </Text>
              </View>
            </View>

            <View style={styles.permissionCard}>
              <View style={[styles.permissionIconCircle, { backgroundColor: '#ecfdf5' }]}>
                <Ionicons name="notifications" size={22} color={Colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.permissionTitle}>🔔 Push Alerts</Text>
                <Text style={styles.permissionDesc}>
                  Delivers emergency 2-mile Amber Alerts when a neighbor’s cat escapes, and native 7-day vaccination booster reminders for your pet.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => handleFinishOnboarding(true)}
            >
              <Text style={styles.primaryBtnText}>Enable & Enter App</Text>
              <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipBtn}
              onPress={() => handleFinishOnboarding(false)}
            >
              <Text style={styles.skipBtnText}>Maybe Later (Enter Without Permissions)</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardContainer: {
    flex: 1,
  },
  progressBarContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  progressDotActive: {
    backgroundColor: Colors.primary,
  },
  progressDotInactive: {
    backgroundColor: '#e2e8f0',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  heroBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#fed7aa',
  },
  heroEmoji: {
    fontSize: 32,
  },
  mainTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  featuresList: {
    gap: 16,
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  featureIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  featureDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  stepSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  rolesContainer: {
    gap: 16,
    marginBottom: 24,
  },
  roleCard: {
    backgroundColor: Colors.surface,
    padding: 18,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  roleCardActive: {
    borderColor: Colors.primary,
    backgroundColor: '#fff7ed',
  },
  roleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  roleIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleBadge: {
    backgroundColor: '#ffedd5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  roleTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  roleDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  avatarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  avatarOption: {
    position: 'relative',
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  avatarOptionSelected: {
    borderColor: Colors.primary,
    borderWidth: 3,
  },
  avatarOptionOwn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
  },
  photoHint: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 17,
    marginTop: -10,
    marginBottom: 18,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
  },
  avatarCheck: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  spotterTipBox: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fff7ed',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fed7aa',
    marginBottom: 24,
  },
  spotterTipText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  permissionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    marginBottom: 14,
  },
  permissionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  permissionDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
    marginTop: 8,
    marginBottom: 12,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  skipBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  backLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
});
