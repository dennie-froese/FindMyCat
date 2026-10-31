import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../theme/colors';
import { CatProfile } from '../types';

interface EditPetModalProps {
  visible: boolean;
  cat: CatProfile;
  onClose: () => void;
  onSaveCat: (updatedCat: CatProfile) => void;
  onDeleteCat?: (catId: string) => void;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1543852786-1cf6624b9987?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1513245543132-31f507417b26?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=600&auto=format&fit=crop&q=80',
];

export const EditPetModal: React.FC<EditPetModalProps> = ({
  visible,
  cat,
  onClose,
  onSaveCat,
  onDeleteCat,
}) => {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(cat.name);
  const [breed, setBreed] = useState(cat.breed);
  const [gender, setGender] = useState<'Male' | 'Female' | undefined>(cat.gender);
  const [isNeutered, setIsNeutered] = useState<boolean>(cat.isNeutered ?? true);
  const [ageYears, setAgeYears] = useState(cat.ageYears !== undefined ? String(cat.ageYears) : '');
  const [coatColour, setCoatColour] = useState(cat.coatColour || cat.coatColor || '');
  const [distinctiveFeatures, setDistinctiveFeatures] = useState(cat.distinctiveFeatures || '');
  const [microchipNumber, setMicrochipNumber] = useState(cat.microchipNumber || '');
  const [emergencyPhone, setEmergencyPhone] = useState(cat.emergencyPhone || '');
  const [homeAddressApprox, setHomeAddressApprox] = useState(cat.homeAddressApprox || '');
  const [medicalNotes, setMedicalNotes] = useState(cat.medicalNotes || '');
  const [photoUrl, setPhotoUrl] = useState(cat.photoUrl || PRESET_AVATARS[0]);

  // Sync state whenever the selected cat changes or modal opens
  useEffect(() => {
    if (visible && cat) {
      setName(cat.name);
      setBreed(cat.breed);
      setGender(cat.gender);
      setIsNeutered(cat.isNeutered ?? true);
      setAgeYears(cat.ageYears !== undefined ? String(cat.ageYears) : '');
      setCoatColour(cat.coatColour || cat.coatColor || '');
      setDistinctiveFeatures(cat.distinctiveFeatures || '');
      setMicrochipNumber(cat.microchipNumber || '');
      setEmergencyPhone(cat.emergencyPhone || '');
      setHomeAddressApprox(cat.homeAddressApprox || '');
      setMedicalNotes(cat.medicalNotes || '');
      setPhotoUrl(cat.photoUrl || PRESET_AVATARS[0]);
    }
  }, [visible, cat]);

  const handlePickPhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Camera roll permissions are required to select a photo.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
        setPhotoUrl(pickerResult.assets[0].uri);
      }
    } catch {
      // In simulator or restricted environments, pick next preset
      const nextIndex = (PRESET_AVATARS.indexOf(photoUrl) + 1) % PRESET_AVATARS.length;
      setPhotoUrl(PRESET_AVATARS[nextIndex]);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter your cat’s name.');
      return;
    }

    if (!coatColour.trim()) {
      Alert.alert('Coat Description Required', 'Please provide a coat colour or pattern description.');
      return;
    }

    if (emergencyPhone.replace(/[^0-9]/g, '').length < 7) {
      Alert.alert(
        'Emergency Contact Required',
        'Please enter a valid contact phone number so neighbours or vets can reach you.'
      );
      return;
    }

    const cleanChip = microchipNumber.replace(/\s+/g, '');
    const parsedAge = parseInt(ageYears, 10);

    const updatedCat: CatProfile = {
      ...cat,
      name: name.trim(),
      breed: breed.trim() || 'Domestic Shorthair',
      gender,
      isNeutered,
      ageYears: Number.isNaN(parsedAge) ? undefined : parsedAge,
      coatColour: coatColour.trim(),
      coatColor: coatColour.trim(),
      distinctiveFeatures: distinctiveFeatures.trim(),
      microchipNumber: cleanChip,
      photoUrl,
      emergencyPhone: emergencyPhone.trim(),
      homeAddressApprox: homeAddressApprox.trim() || undefined,
      medicalNotes: medicalNotes.trim(),
    };

    onSaveCat(updatedCat);
    onClose();

    Alert.alert(
      '✓ Passport Updated',
      `${updatedCat.name}’s profile and health records have been updated.`
    );
  };

  const handleDelete = () => {
    if (!onDeleteCat) return;

    if (cat.status === 'missing') {
      Alert.alert(
        '⚠️ Cat Currently Reported Missing',
        `Removing ${cat.name} will immediately stand down the active neighbourhood Amber Alert and remove their records. Do you want to proceed?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove & Stand Down',
            style: 'destructive',
            onPress: () => {
              onDeleteCat(cat.id);
              onClose();
            },
          },
        ]
      );
    } else {
      Alert.alert(
        `Remove ${cat.name}?`,
        `Are you sure you want to remove ${cat.name} from your Digital Health Passport? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove Pet',
            style: 'destructive',
            onPress: () => {
              onDeleteCat(cat.id);
              onClose();
            },
          },
        ]
      );
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Edit Pet Passport</Text>
              <Text style={styles.modalSubtitle}>Update details, medical notes & microchip</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close edit pet passport modal" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            {/* Photo Selection */}
            <View style={styles.photoPickerRow}>
              <Image source={{ uri: photoUrl }} style={styles.petPreviewPhoto} />
              <View style={{ flex: 1, gap: 8 }}>
                <TouchableOpacity style={styles.changePhotoBtn} onPress={handlePickPhoto}>
                  <Ionicons name="camera" size={16} color={Colors.primary} />
                  <Text style={styles.changePhotoText}>Change Photo</Text>
                </TouchableOpacity>
                <Text style={styles.photoHint}>
                  Tap to choose a fresh high-resolution photo from your gallery.
                </Text>
              </View>
            </View>

            {/* Name */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Cat's Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Luna"
                value={name}
                onChangeText={setName}
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            {/* Breed & Age */}
            <View style={styles.twoColRow}>
              <View style={[styles.fieldGroup, { flex: 1.5 }]}>
                <Text style={styles.label}>Breed</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. British Shorthair"
                  value={breed}
                  onChangeText={setBreed}
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.label}>Age (Years)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2"
                  value={ageYears}
                  onChangeText={setAgeYears}
                  keyboardType="numeric"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>

            {/* Gender & Neutered */}
            <View style={styles.twoColRow}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.label}>Gender</Text>
                <View style={styles.genderToggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.genderBtn,
                      gender === 'Female' && styles.genderBtnActive,
                    ]}
                    onPress={() => setGender('Female')}
                  >
                    <Text
                      style={[
                        styles.genderBtnText,
                        gender === 'Female' && styles.genderBtnTextActive,
                      ]}
                    >
                      Female
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.genderBtn,
                      gender === 'Male' && styles.genderBtnActive,
                    ]}
                    onPress={() => setGender('Male')}
                  >
                    <Text
                      style={[
                        styles.genderBtnText,
                        gender === 'Male' && styles.genderBtnTextActive,
                      ]}
                    >
                      Male
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.label}>Neutered / Spayed</Text>
                <View style={styles.neuteredRow}>
                  <Text style={styles.neuteredLabel}>{isNeutered ? 'Yes ✓' : 'No'}</Text>
                  <Switch
                    value={isNeutered}
                    onValueChange={setIsNeutered}
                    trackColor={{ false: '#cbd5e1', true: Colors.success }}
                  />
                </View>
              </View>
            </View>

            {/* Coat Colour & Distinctive Markings */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Coat Colour & Markings *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Warm Ginger with White Bib & Paws"
                value={coatColour}
                onChangeText={setCoatColour}
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Distinctive Identifiers / Scars</Text>
              <TextInput
                style={[styles.input, { minHeight: 60 }]}
                placeholder="e.g. Small notch in left ear, white tip on tail"
                value={distinctiveFeatures}
                onChangeText={setDistinctiveFeatures}
                multiline
                numberOfLines={2}
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            {/* Microchip & Phone */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>ISO Microchip Number (15 Digits)</Text>
                <Text style={styles.labelOptional}>ISO 11784/11785</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="e.g. 985141002345678"
                value={microchipNumber}
                onChangeText={setMicrochipNumber}
                keyboardType="numeric"
                maxLength={18}
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Emergency Contact Phone *</Text>
              <TextInput
                style={styles.input}
                placeholder="+44 7700 900123"
                value={emergencyPhone}
                onChangeText={setEmergencyPhone}
                keyboardType="phone-pad"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            {/* Home Address / Neighborhood */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Approximate Home Area</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Near Victoria Park / St. Mark’s Gate"
                value={homeAddressApprox}
                onChangeText={setHomeAddressApprox}
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            {/* Medical Notes & Dietary Requirements */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Medical & Dietary Notes</Text>
                <Text style={styles.labelOptional}>Health Vault</Text>
              </View>
              <TextInput
                style={[styles.input, { minHeight: 70 }]}
                placeholder="e.g. Hypoallergenic dry food only, daily thyroid medication, shy around dogs"
                value={medicalNotes}
                onChangeText={setMedicalNotes}
                multiline
                numberOfLines={3}
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            {/* Danger Zone: Archive / Delete Pet */}
            {onDeleteCat && (
              <View style={styles.dangerZone}>
                <Text style={styles.dangerZoneTitle}>Pet Vault Management</Text>
                <Text style={styles.dangerZoneText}>
                  If this pet has rehomed or passed away, you can archive or delete this record from your vault.
                </Text>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={handleDelete}
                  activeOpacity={0.8}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                  <Text style={styles.deleteBtnText}>Archive / Remove {cat.name}</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  formScroll: {
    paddingHorizontal: 20,
  },
  formContent: {
    paddingVertical: 16,
    gap: 14,
  },
  photoPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  petPreviewPhoto: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#cbd5e1',
  },
  changePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff7ed',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  changePhotoText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  photoHint: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  fieldGroup: {
    gap: 6,
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 12,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  labelOptional: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  genderToggleRow: {
    flexDirection: 'row',
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    padding: 3,
  },
  genderBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  genderBtnActive: {
    backgroundColor: Colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  genderBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  genderBtnTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  neuteredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    height: 44,
  },
  neuteredLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  dangerZone: {
    marginTop: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 6,
  },
  dangerZoneTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.danger,
  },
  dangerZoneText: {
    fontSize: 11,
    color: '#991b1b',
    lineHeight: 16,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 6,
  },
  deleteBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.danger,
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },
});
