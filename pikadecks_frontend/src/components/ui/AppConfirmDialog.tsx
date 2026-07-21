import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, shadows } from '@/constants/theme';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'destructive' renders the confirm button in red. Default is 'default'. */
  variant?: 'destructive' | 'default';
  icon?: React.ComponentProps<typeof Feather>['name'];
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

interface AppConfirmDialogProps {
  visible: boolean;
  options: ConfirmDialogOptions | null;
  onDismiss: () => void;
}

export function AppConfirmDialog({ visible, options, onDismiss }: AppConfirmDialogProps) {
  const scale = useRef(new Animated.Value(0.88)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = React.useState(false);

  useEffect(() => {
    if (visible) {
      setLoading(false);
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 18,
          stiffness: 220,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scale, { toValue: 0.92, duration: 140, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleConfirm = async () => {
    if (!options || loading) return;
    setLoading(true);
    try {
      await options.onConfirm();
    } finally {
      setLoading(false);
      onDismiss();
    }
  };

  const handleCancel = () => {
    options?.onCancel?.();
    onDismiss();
  };

  if (!options) return null;

  const isDestructive = options.variant !== 'default';
  const icon = options.icon ?? (isDestructive ? 'trash-2' : 'alert-circle');
  const iconBg = isDestructive ? '#FEE2E2' : '#EEF2FF';
  const iconColor = isDestructive ? colors.danger : colors.primary;
  const confirmColor = isDestructive ? colors.danger : colors.primary;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleCancel} statusBarTranslucent>
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={handleCancel}>
        <Animated.View style={[styles.backdrop, { opacity }]} />
      </Pressable>

      {/* Card */}
      <View style={styles.centeredWrapper} pointerEvents="box-none">
        <Animated.View style={[styles.card, { transform: [{ scale }], opacity }]}>
          {/* Icon bubble */}
          <View style={[styles.iconBubble, { backgroundColor: iconBg }]}>
            <Feather name={icon} size={24} color={iconColor} />
          </View>

          <Text style={styles.title}>{options.title}</Text>
          <Text style={styles.message}>{options.message}</Text>

          {/* Buttons */}
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleCancel}
              activeOpacity={0.75}
              disabled={loading}
            >
              <Text style={styles.cancelBtnText}>{options.cancelLabel ?? 'Cancel'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: confirmColor }, loading && styles.btnDisabled]}
              onPress={handleConfirm}
              activeOpacity={0.82}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.confirmBtnText}>{options.confirmLabel ?? 'Confirm'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  centeredWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius['3xl'],
    padding: 28,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    ...shadows.pop,
  },
  iconBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.foreground,
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: colors.mutedForeground,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.foreground,
  },
  confirmBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
