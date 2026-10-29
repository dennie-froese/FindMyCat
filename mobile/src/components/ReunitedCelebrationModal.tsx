import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Image,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { CatProfile } from '../types';

export interface ReunitedCelebrationModalProps {
  visible: boolean;
  cat: CatProfile | null;
  onClose: () => void;
  onRateApp?: () => void;
}

export const ReunitedCelebrationModal: React.FC<ReunitedCelebrationModalProps> = ({
  visible,
  cat,
  onClose,
  onRateApp,
}) => {
  if (!cat) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.cardContainer}>
          {/* Confetti / Celebration Header Icon */}
          <View style={styles.celebrationIconBadge}>
            <Text style={styles.celebrationEmoji}>🎉</Text>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={styles.headline}>SAFELY REUNITED!</Text>
            <Text style={styles.subheadline}>
              Fantastic news! <Text style={styles.catNameHighlight}>{cat.name}</Text> is back home where they belong.
            </Text>

            {/* Framed Pet Avatar */}
            <View style={styles.avatarWrapper}>
              <Image
                source={{ uri: cat.photoUrl }}
                style={styles.avatarImage}
                resizeMode="cover"
              />
              <View style={styles.safeTagBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#ffffff" />
                <Text style={styles.safeTagText}>SAFELY HOME</Text>
              </View>
            </View>

            {/* Stand-Down Checklist */}
            <View style={styles.standDownBox}>
              <Text style={styles.standDownTitle}>AUTOMATIC STAND-DOWN ACTIONS</Text>

              <View style={styles.checkItem}>
                <View style={styles.checkCircle}>
                  <Ionicons name="checkmark" size={12} color="#10b981" />
                </View>
                <Text style={styles.checkText}>
                  2-mile emergency Amber Alert broadcast stood down
                </Text>
              </View>

              <View style={styles.checkItem}>
                <View style={styles.checkCircle}>
                  <Ionicons name="checkmark" size={12} color="#10b981" />
                </View>
                <Text style={styles.checkText}>
                  Neighbourhood Radar feed updated to <Text style={{ fontWeight: '700' }}>Safely Reunited</Text>
                </Text>
              </View>

              <View style={styles.checkItem}>
                <View style={styles.checkCircle}>
                  <Ionicons name="checkmark" size={12} color="#10b981" />
                </View>
                <Text style={styles.checkText}>
                  QR code lost posters marked resolved
                </Text>
              </View>
            </View>

            {/* Community Thank You Note */}
            <View style={styles.communityNote}>
              <Ionicons name="heart" size={16} color="#e11d48" />
              <Text style={styles.communityNoteText}>
                Thank you to all local spotters, neighbours, and lookouts who kept an eye out.
              </Text>
            </View>

            {/* Rate App Action */}
            {onRateApp && (
              <TouchableOpacity
                style={styles.rateButton}
                onPress={onRateApp}
                activeOpacity={0.85}
              >
                <Ionicons name="star" size={16} color="#ffffff" />
                <Text style={styles.rateButtonText}>Rate & Support Local Spotters</Text>
              </TouchableOpacity>
            )}

            {/* Close Button */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.closeButtonText}>Back to Pet Passport</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    position: 'relative',
  },
  celebrationIconBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#ecfdf5',
    borderWidth: 4,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -48,
    marginBottom: 8,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  celebrationEmoji: {
    fontSize: 32,
  },
  scrollContent: {
    alignItems: 'center',
    width: '100%',
  },
  headline: {
    fontSize: 22,
    fontWeight: '900',
    color: '#065f46',
    letterSpacing: 0.5,
    marginBottom: 6,
    textAlign: 'center',
  },
  subheadline: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 10,
  },
  catNameHighlight: {
    color: Colors.textPrimary,
    fontWeight: '800',
  },
  avatarWrapper: {
    position: 'relative',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#10b981',
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  safeTagBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(16, 185, 129, 0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
    gap: 4,
  },
  safeTagText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  standDownBox: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  standDownTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  communityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff1f2',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#fecdd3',
    gap: 8,
    marginBottom: 20,
    width: '100%',
  },
  communityNoteText: {
    flex: 1,
    fontSize: 12,
    color: '#9f1239',
    lineHeight: 16,
    fontWeight: '500',
  },
  rateButton: {
    width: '100%',
    backgroundColor: '#f59e0b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    gap: 8,
    marginBottom: 10,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  rateButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  closeButton: {
    width: '100%',
    backgroundColor: '#10b981',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});
