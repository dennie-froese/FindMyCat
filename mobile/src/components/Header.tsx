import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';

interface HeaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
  hasActiveEmergency?: boolean;
  onSearchPress?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  badge,
  hasActiveEmergency = false,
  onSearchPress,
}) => {
  const isMissingBadge = hasActiveEmergency || Boolean(badge && badge.includes('MISSING'));
  return (
    <View style={styles.container}>
      {/* Top brand & status row */}
      <View style={styles.topRow}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Ionicons name="paw" size={18} color="#ffffff" />
          </View>
          <View>
            <Text style={styles.brandTitle}>Find My Cat</Text>
            <View style={styles.liveRadarRow}>
              <View
                style={[
                  styles.pulseDot,
                  isMissingBadge && { backgroundColor: Colors.danger },
                ]}
              />
              <Text style={styles.radarZoneText}>
                {badge || 'LIVE RADAR • 2 MI RADIUS'}
              </Text>
            </View>
          </View>
        </View>

        {/* Action button */}
        {onSearchPress && (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={onSearchPress}
            accessibilityRole="button"
            accessibilityLabel="Neighbourhood alerts and notifications"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="notifications-outline" size={20} color={Colors.textPrimary} />
            {isMissingBadge && <View style={styles.bellBadgeDot} />}
          </TouchableOpacity>
        )}
      </View>

      {/* Main Title & Subtitle */}
      <View style={styles.titleSection}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  liveRadarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  radarZoneText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bellBadgeDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  titleSection: {
    marginTop: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
