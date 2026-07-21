import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, shadows } from '@/constants/theme';

interface LockedFeatureModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  badge: 'Developer Stage' | 'Beta Access' | 'Coming Soon' | 'Early Preview';
  description: string;
  iconName?: keyof typeof Feather.glyphMap;
}

export function LockedFeatureModal({
  visible,
  onClose,
  title,
  badge,
  description,
  iconName = 'lock',
}: LockedFeatureModalProps) {
  // Select badge color combinations for rich premium aesthetic
  const getBadgeColors = () => {
    switch (badge) {
      case 'Developer Stage':
        return {
          bg: 'rgba(91, 79, 230, 0.1)',
          text: colors.primary,
          border: 'rgba(91, 79, 230, 0.25)',
        };
      case 'Beta Access':
        return {
          bg: 'rgba(61, 188, 140, 0.1)',
          text: colors.success,
          border: 'rgba(61, 188, 140, 0.25)',
        };
      case 'Early Preview':
        return {
          bg: 'rgba(229, 177, 79, 0.1)',
          text: colors.warning,
          border: 'rgba(229, 177, 79, 0.25)',
        };
      case 'Coming Soon':
      default:
        return {
          bg: 'rgba(229, 84, 76, 0.1)',
          text: colors.danger,
          border: 'rgba(229, 84, 76, 0.25)',
        };
    }
  };

  const badgeTheme = getBadgeColors();

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalCard}>
              {/* Premium Glow Top Border */}
              <LinearGradient
                colors={['#5B4FE6', '#F4B98A', '#E5544C']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.glowBar}
              />

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>

              {/* Glowing Lock Ring */}
              <View style={styles.iconWrapper}>
                <LinearGradient
                  colors={['rgba(91, 79, 230, 0.15)', 'rgba(244, 185, 138, 0.15)']}
                  style={styles.iconGlow}
                >
                  <View style={styles.iconInner}>
                    <Feather name={iconName} size={28} color={colors.primary} />
                  </View>
                </LinearGradient>
              </View>

              {/* Status Badge */}
              <View
                style={[
                  styles.badge,
                  { backgroundColor: badgeTheme.bg, borderColor: badgeTheme.border },
                ]}
              >
                <Text style={[styles.badgeText, { color: badgeTheme.text }]}>
                  {badge.toUpperCase()}
                </Text>
              </View>

              {/* Text Information */}
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.description}>{description}</Text>

              {/* Waitlist Call To Action */}
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={onClose}
                style={styles.actionBtn}
              >
                <LinearGradient
                  colors={[colors.primary, '#7A6EFA']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.gradientBtn}
                >
                  <Text style={styles.btnText}>Notify Me When Available</Text>
                  <Feather name="bell" size={14} color={colors.primaryForeground} />
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={onClose}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 10, 5, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: Platform.OS === 'web' ? 380 : '100%',
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: radius['3xl'],
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.pop,
  },
  glowBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.muted,
  },
  iconWrapper: {
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlow: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  iconInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    shadowColor: colors.primary,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    marginBottom: 14,
    alignSelf: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.foreground,
    textAlign: 'center',
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  actionBtn: {
    width: '100%',
    borderRadius: radius['2xl'],
    overflow: 'hidden',
    marginBottom: 10,
    ...shadows.soft,
  },
  gradientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  btnText: {
    color: colors.primaryForeground,
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 13,
    color: colors.mutedForeground,
    fontWeight: '700',
  },
});
