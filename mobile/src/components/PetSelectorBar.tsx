import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { CatProfile } from '../types';

interface PetSelectorBarProps {
  cats: CatProfile[];
  selectedCatId: string;
  onSelectCat: (catId: string) => void;
  onAddPetPress: () => void;
}

export const PetSelectorBar: React.FC<PetSelectorBarProps> = ({
  cats,
  selectedCatId,
  onSelectCat,
  onAddPetPress,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleWithIcon}>
          <Ionicons name="paw" size={16} color={Colors.primary} />
          <Text style={styles.sectionTitle}>MY PET PASSPORTS</Text>
        </View>
        <Text style={styles.countText}>{cats.length} {cats.length === 1 ? 'cat' : 'cats'} registered</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {cats.map((cat) => {
          const isSelected = cat.id === selectedCatId;
          const isMissing = cat.status === 'missing';

          return (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.petCard,
                isSelected && styles.petCardSelected,
                isMissing && styles.petCardMissing,
              ]}
              onPress={() => onSelectCat(cat.id)}
              activeOpacity={0.8}
            >
              <View style={styles.avatarWrapper}>
                <Image source={{ uri: cat.photoUrl }} style={styles.avatarImage} />
                {isMissing ? (
                  <View style={styles.missingBadge}>
                    <Ionicons name="warning" size={10} color="#ffffff" />
                  </View>
                ) : (
                  <View style={styles.safeBadge}>
                    <Ionicons name="checkmark" size={10} color="#ffffff" />
                  </View>
                )}
              </View>

              <Text
                style={[
                  styles.petName,
                  isSelected && styles.petNameSelected,
                  isMissing && styles.petNameMissing,
                ]}
                numberOfLines={1}
              >
                {cat.name}
              </Text>

              <Text style={styles.petBreed} numberOfLines={1}>
                {cat.breed.split('/')[0].trim()}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Add New Pet Button */}
        <TouchableOpacity
          style={styles.addPetCard}
          onPress={onAddPetPress}
          activeOpacity={0.7}
        >
          <View style={styles.addIconCircle}>
            <Ionicons name="add" size={20} color={Colors.primary} />
          </View>
          <Text style={styles.addPetText}>Add Cat</Text>
          <Text style={styles.addPetSubtext}>New Passport</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: Colors.textMuted,
  },
  countText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  petCard: {
    width: 88,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  petCardSelected: {
    backgroundColor: '#fff7ed',
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  petCardMissing: {
    borderColor: Colors.danger,
    backgroundColor: '#fef2f2',
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 6,
  },
  avatarImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#cbd5e1',
  },
  missingBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  safeBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  petName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  petNameSelected: {
    color: Colors.primary,
    fontWeight: '800',
  },
  petNameMissing: {
    color: Colors.danger,
  },
  petBreed: {
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  addPetCard: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 14,
    backgroundColor: '#fafaf9',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
  },
  addIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  addPetText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  addPetSubtext: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
