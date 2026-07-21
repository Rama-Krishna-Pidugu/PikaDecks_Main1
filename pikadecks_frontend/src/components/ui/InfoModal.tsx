import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, shadows } from '@/constants/theme';

export interface InfoModalOptions {
  title: string;
  message: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
  /** Optional primary action CTA button */
  action?: {
    label: string;
    onPress: () => void;
  };
  dismissLabel?: string;
}

interface InfoModalProps {
  visible: boolean;
  options: InfoModalOptions | null;
  onDismiss: () => void;
}

export function InfoModal({ visible, options, onDismiss }: InfoModalProps) {
  const scale = useRef(new Animated.Value(0.88)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
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

  if (!options) return null;

  const icon = options.icon ?? 'info';

  const handleAction = () => {
    options.action?.onPress();
    onDismiss();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Animated.View style={[styles.backdrop, { opacity }]} />
      </Pressable>

      <View style={styles.centeredWrapper} pointerEvents="box-none">
        <Animated.View style={[styles.card, { transform: [{ scale }], opacity }]}>
          <View style={styles.iconBubble}>
            <Feather name={icon} size={24} color={colors.primary} />
          </View>

          <Text style={styles.title}>{options.title}</Text>
          <Text style={styles.message}>{options.message}</Text>

          <View style={[styles.btnCol, !options.action && styles.btnColSingle]}>
            {options.action && (
              <TouchableOpacity style={styles.actionBtn} onPress={handleAction} activeOpacity={0.85}>
                <Text style={styles.actionBtnText}>{options.action.label}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} activeOpacity={0.75}>
              <Text style={styles.dismissBtnText}>{options.dismissLabel ?? 'Got it'}</Text>
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
    backgroundColor: 'rgba(0,0,0,0.40)',
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
    backgroundColor: '#EEF2FF',
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
    marginBottom: 24,
  },
  btnCol: {
    width: '100%',
    gap: 10,
  },
  btnColSingle: {
    alignItems: 'center',
  },
  actionBtn: {
    width: '100%',
    height: 48,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  dismissBtn: {
    width: '100%',
    height: 44,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.mutedForeground,
  },
});
