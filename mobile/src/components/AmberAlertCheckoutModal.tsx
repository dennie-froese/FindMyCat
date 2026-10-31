import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { stripeService, STRIPE_CONFIG } from '../services/stripeService';
import { CatProfile } from '../types';

interface AmberAlertCheckoutModalProps {
  visible: boolean;
  cat: CatProfile;
  onClose: () => void;
  onAlertActivated: (boosted: boolean) => void;
}

export const AmberAlertCheckoutModal: React.FC<AmberAlertCheckoutModalProps> = ({
  visible,
  cat,
  onClose,
  onAlertActivated,
}) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);

  const handleStripeAmberAlertPurchase = async () => {
    setLoading(true);
    try {
      const result = await stripeService.createAmberAlertPayment({
        catId: cat.id,
        catName: cat.name,
        radiusMiles: 2.0,
      });

      if (result.success) {
        Alert.alert(
          '🚨 Amber Alert Dispatched!',
          `Payment of ${STRIPE_CONFIG.AMBER_ALERT_PRICE_DISPLAY} processed via Stripe. High-intensity 2-mile emergency radar broadcast is now active for ${cat.name}.`,
          [
            {
              text: 'Open Radar',
              onPress: () => {
                onAlertActivated(true);
                onClose();
              },
            },
          ]
        );
      } else {
        Alert.alert('Payment Error', result.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFreeActivation = () => {
    Alert.alert(
      'Standard Missing Mode',
      `Mark ${cat.name} as missing on the 2-mile neighbourhood radar for free, without the paid SMS & volunteer coordinator dispatch?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate Free Alert',
          onPress: () => {
            onAlertActivated(false);
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.emergencyBadge}>
              <Ionicons name="warning" size={14} color="#ffffff" />
              <Text style={styles.emergencyBadgeText}>EMERGENCY MISSING MODE</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close emergency alert modal" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.title}>Trigger Amber Alert for {cat.name}?</Text>
            <Text style={styles.subtitle}>
              Broadcast 2-mile neighborhood alert. Mobilise hundreds of local pet lovers, vet practices, and rescue volunteers in minutes.
            </Text>

            {/* Amber Alert Feature Box */}
            <View style={styles.heroBox}>
              <View style={styles.heroPriceRow}>
                <View>
                  <Text style={styles.heroBoxTitle}>2-Mile Emergency Broadcast</Text>
                  <Text style={styles.heroBoxSub}>One-off broadcast • Powered by Stripe</Text>
                </View>
                <View style={styles.pricePill}>
                  <Text style={styles.pricePillText}>{STRIPE_CONFIG.AMBER_ALERT_PRICE_DISPLAY}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.featureList}>
                <View style={styles.featureItem}>
                  <Ionicons name="radio" size={18} color={Colors.danger} />
                  <Text style={styles.featureText}>
                    <Text style={styles.bold}>2-Mile High-Priority Perimeter:</Text> Push notification burst to all active app users within radius.
                  </Text>
                </View>

                <View style={styles.featureItem}>
                  <Ionicons name="megaphone" size={18} color={Colors.danger} />
                  <Text style={styles.featureText}>
                    <Text style={styles.bold}>SMS Alert Surge:</Text> Instant dispatch to registered volunteer lookouts & area coordinators.
                  </Text>
                </View>

                <View style={styles.featureItem}>
                  <Ionicons name="pin" size={18} color={Colors.danger} />
                  <Text style={styles.featureText}>
                    <Text style={styles.bold}>72-Hour Pinned Hero Card:</Text> Top-ranking spotlight at the very top of the live neighbourhood radar.
                  </Text>
                </View>

                <View style={styles.featureItem}>
                  <Ionicons name="print" size={18} color={Colors.danger} />
                  <Text style={styles.featureText}>
                    <Text style={styles.bold}>Instant Vector Poster:</Text> High-contrast A4 lost poster generated with dynamic QR code.
                  </Text>
                </View>
              </View>
            </View>

            {/* Stripe Purchase Button */}
            <TouchableOpacity
              style={styles.stripeButton}
              onPress={handleStripeAmberAlertPurchase}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="card" size={20} color="#ffffff" />
                  <Text style={styles.stripeButtonText}>
                    Broadcast 2-Mile Amber Alert ({STRIPE_CONFIG.AMBER_ALERT_PRICE_DISPLAY})
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.stripeSecurityRow}>
              <Ionicons name="lock-closed" size={12} color={Colors.textMuted} />
              <Text style={styles.stripeSecurityText}>
                Secure 256-bit encrypted checkout via Stripe • Apple Pay & Google Pay ready
              </Text>
            </View>

            {/* Free Alternative Option */}
            <View style={styles.freeOptionContainer}>
              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>OR</Text>
                <View style={styles.orLine} />
              </View>

              <TouchableOpacity
                style={styles.freeButton}
                onPress={handleFreeActivation}
                disabled={loading}
              >
                <Ionicons name="shield-outline" size={18} color={Colors.textSecondary} />
                <Text style={styles.freeButtonText}>Activate Standard Missing Mode (Free)</Text>
              </TouchableOpacity>
              <Text style={styles.freeSubtext}>
                Posts your missing alert to the live 2-mile neighbourhood radar feed for free.
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  emergencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.danger,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
  },
  emergencyBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.textPrimary,
    letterSpacing: -0.4,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  heroBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
  },
  heroPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroBoxTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#991b1b',
  },
  heroBoxSub: {
    fontSize: 11,
    color: '#b91c1c',
    marginTop: 1,
  },
  pricePill: {
    backgroundColor: Colors.danger,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  pricePillText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#ffffff',
  },
  divider: {
    height: 1,
    backgroundColor: '#fee2e2',
    marginVertical: 12,
  },
  featureList: {
    gap: 10,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  featureText: {
    flex: 1,
    fontSize: 12,
    color: '#7f1d1d',
    lineHeight: 17,
  },
  bold: {
    fontWeight: '800',
  },
  stripeButton: {
    backgroundColor: Colors.danger,
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: Colors.danger,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  stripeButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  stripeSecurityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  stripeSecurityText: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  freeOptionContainer: {
    marginTop: 14,
    alignItems: 'center',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  orText: {
    paddingHorizontal: 12,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  freeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    width: '100%',
    gap: 8,
  },
  freeButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  freeSubtext: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },
});
