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
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import {
  revenueCatService,
  GUARDIAN_PERKS,
  REVENUECAT_CONFIG,
} from '../services/revenueCatService';
import { GuardianSubscriptionStatus } from '../types';

interface GuardianPaywallModalProps {
  visible: boolean;
  onClose: () => void;
  onSubscriptionSuccess: (status: GuardianSubscriptionStatus) => void;
}

export const GuardianPaywallModal: React.FC<GuardianPaywallModalProps> = ({
  visible,
  onClose,
  onSubscriptionSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('monthly');
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const result = await revenueCatService.purchaseGuardianSubscription(selectedPlan);
      if (result.success) {
        onSubscriptionSuccess(result.status);
        Alert.alert('Cat Guardian Active! 🛡️', result.message, [
          { text: 'Great!', onPress: onClose },
        ]);
      } else {
        Alert.alert('Purchase Incomplete', result.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const result = await revenueCatService.restorePurchases();
      if (result.restored) {
        onSubscriptionSuccess(result.status);
        Alert.alert('Restored Successfully', result.message, [
          { text: 'OK', onPress: onClose },
        ]);
      } else {
        Alert.alert('Restore Purchases', result.message);
      }
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          {/* Header Bar */}
          <View style={styles.headerRow}>
            <View style={styles.headerBadge}>
              <Ionicons name="sparkles" size={14} color="#ffffff" />
              <Text style={styles.headerBadgeText}>CAT GUARDIAN TIER</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close Cat Guardian paywall" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Hero Title */}
            <Text style={styles.title}>Complete Protection for Every Cat You Love</Text>
            <Text style={styles.subtitle}>
              Protect every cat in your household with automated booster reminders and priority radar alerts. Cancel anytime.
            </Text>

            {/* Plan Selector */}
            <View style={styles.planSelectorRow}>
              <TouchableOpacity
                style={[
                  styles.planCard,
                  selectedPlan === 'monthly' && styles.planCardActive,
                ]}
                onPress={() => setSelectedPlan('monthly')}
                activeOpacity={0.8}
              >
                <View style={styles.planCardHeader}>
                  <Text style={[styles.planTitle, selectedPlan === 'monthly' && styles.planTitleActive]}>
                    Monthly Plan
                  </Text>
                  <View style={styles.popularPill}>
                    <Text style={styles.popularPillText}>MOST POPULAR</Text>
                  </View>
                </View>
                <Text style={styles.planPrice}>{REVENUECAT_CONFIG.MONTHLY_PRICE_DISPLAY.split(" ")[0]}</Text>
                <Text style={styles.planPeriod}>per month • auto-renewing</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.planCard,
                  selectedPlan === 'annual' && styles.planCardActive,
                ]}
                onPress={() => setSelectedPlan('annual')}
                activeOpacity={0.8}
              >
                <View style={styles.planCardHeader}>
                  <Text style={[styles.planTitle, selectedPlan === 'annual' && styles.planTitleActive]}>
                    Annual Plan
                  </Text>
                  <View style={[styles.popularPill, { backgroundColor: '#dcfce7' }]}>
                    <Text style={[styles.popularPillText, { color: '#15803d' }]}>SAVE 16%</Text>
                  </View>
                </View>
                <Text style={styles.planPrice}>{REVENUECAT_CONFIG.ANNUAL_PRICE_DISPLAY.split(" ")[0]}</Text>
                <Text style={styles.planPeriod}>per year (£2.49/mo eq.)</Text>
              </TouchableOpacity>
            </View>

            {/* Perks List */}
            <View style={styles.perksContainer}>
              <Text style={styles.perksHeader}>WHAT GUARDIAN UNLOCKS</Text>
              {GUARDIAN_PERKS.map((perk) => (
                <View key={perk.id} style={styles.perkRow}>
                  <View style={styles.perkIconBox}>
                    <Ionicons name={perk.icon as any} size={18} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.perkTitle}>{perk.title}</Text>
                    <Text style={styles.perkDesc}>{perk.description}</Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                </View>
              ))}
            </View>

            {/* CTA Button */}
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={handleSubscribe}
              disabled={loading || restoring}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark" size={20} color="#ffffff" />
                  <Text style={styles.ctaButtonText}>
                    {selectedPlan === 'monthly'
                      ? `Subscribe for ${REVENUECAT_CONFIG.MONTHLY_PRICE_DISPLAY}`
                      : `Subscribe for ${REVENUECAT_CONFIG.ANNUAL_PRICE_DISPLAY}`}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Restore & Legal Footer */}
            <View style={styles.footerContainer}>
              <TouchableOpacity
                onPress={handleRestore}
                disabled={restoring || loading}
                style={styles.restoreBtn}
              >
                {restoring ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Text style={styles.restoreBtnText}>Restore Existing Purchases</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.legalNotice}>
                Payment will be charged to your Apple ID or Google Play account at confirmation of purchase. Subscription automatically renews unless cancelled at least 24 hours before the end of the current billing period. You can manage or cancel your subscription anytime in your device Account Settings.
              </Text>

              <View style={styles.legalLinksRow}>
                <TouchableOpacity
                  onPress={() => Linking.openURL('https://find-my-cat.uk/terms')}
                  accessibilityRole="link"
                  accessibilityLabel="Terms of Use (EULA)"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.legalLinkText}>Terms of Use (EULA)</Text>
                </TouchableOpacity>
                <Text style={styles.legalLinkDot}>•</Text>
                <TouchableOpacity
                  onPress={() => Linking.openURL('https://find-my-cat.uk/privacy')}
                  accessibilityRole="link"
                  accessibilityLabel="Privacy Policy"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.legalLinkText}>Privacy Policy</Text>
                </TouchableOpacity>
              </View>
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
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
  },
  headerBadgeText: {
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
    letterSpacing: -0.5,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
    marginBottom: 16,
  },
  planSelectorRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  planCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  planCardActive: {
    borderColor: Colors.primary,
    backgroundColor: '#fff7ed',
  },
  planCardHeader: {
    flexDirection: 'column',
    gap: 4,
  },
  planTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  planTitleActive: {
    color: Colors.primary,
  },
  popularPill: {
    backgroundColor: '#ffedd5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  popularPillText: {
    fontSize: 8,
    fontWeight: '800',
    color: Colors.primary,
  },
  planPrice: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.textPrimary,
    marginTop: 6,
  },
  planPeriod: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  perksContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 18,
  },
  perksHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.6,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  perkIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  perkDesc: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
    lineHeight: 15,
  },
  ctaButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  footerContainer: {
    marginTop: 14,
    alignItems: 'center',
    gap: 8,
  },
  restoreBtn: {
    paddingVertical: 6,
  },
  restoreBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  legalNotice: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 14,
  },
  legalLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  legalLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textDecorationLine: 'underline',
  },
  legalLinkDot: {
    fontSize: 11,
    color: Colors.textMuted,
  },
});
