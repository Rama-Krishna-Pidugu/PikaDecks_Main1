import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { Animated, Text, StyleSheet, View, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, shadows } from '@/constants/theme';
import { AppConfirmDialog, ConfirmDialogOptions } from './AppConfirmDialog';
import { InfoModal, InfoModalOptions } from './InfoModal';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastContextType {
  showToast: (message: string, type?: ToastType, subtitle?: string) => void;
  showConfirm: (options: ConfirmDialogOptions) => void;
  showInfo: (options: InfoModalOptions) => void;
  toast: { message: string; type: ToastType; subtitle?: string } | null;
  translateY: Animated.Value;
  opacity: Animated.Value;
  hideToast: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ message: string; type: ToastType; subtitle?: string } | null>(null);
  const translateY = useRef(new Animated.Value(30)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Confirm dialog state ──────────────────────────────────────────────────
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmOptions, setConfirmOptions] = useState<ConfirmDialogOptions | null>(null);

  // ── Info modal state ──────────────────────────────────────────────────────
  const [infoVisible, setInfoVisible] = useState(false);
  const [infoOptions, setInfoOptions] = useState<InfoModalOptions | null>(null);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const showToast = useCallback((message: string, type: ToastType = 'info', subtitle?: string) => {
    setToast({ message, type, subtitle });

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 60,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    timeoutRef.current = setTimeout(() => {
      hideToast();
    }, 5000);
  }, [translateY, opacity]);

  const hideToast = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: 10, duration: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setToast(null);
    });
  }, [translateY, opacity]);

  // ── Confirm ───────────────────────────────────────────────────────────────
  const showConfirm = useCallback((options: ConfirmDialogOptions) => {
    setConfirmOptions(options);
    setConfirmVisible(true);
  }, []);

  const hideConfirm = useCallback(() => {
    setConfirmVisible(false);
    setTimeout(() => setConfirmOptions(null), 300);
  }, []);

  // ── Info ──────────────────────────────────────────────────────────────────
  const showInfo = useCallback((options: InfoModalOptions) => {
    setInfoOptions(options);
    setInfoVisible(true);
  }, []);

  const hideInfo = useCallback(() => {
    setInfoVisible(false);
    setTimeout(() => setInfoOptions(null), 300);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, showConfirm, showInfo, toast, translateY, opacity, hideToast }}>
      {children}
      <ToastOverlay />
      <AppConfirmDialog visible={confirmVisible} options={confirmOptions} onDismiss={hideConfirm} />
      <InfoModal visible={infoVisible} options={infoOptions} onDismiss={hideInfo} />
    </ToastContext.Provider>
  );
}

export function ToastOverlay() {
  const ctx = useContext(ToastContext);
  if (!ctx || !ctx.toast) return null;

  const { toast, translateY, opacity, hideToast } = ctx;

  const getToastIcon = (type: ToastType) => {
    switch (type) {
      case 'success':  return 'check-circle';
      case 'error':    return 'alert-circle';
      case 'warning':  return 'alert-triangle';
      case 'info':     return 'info';
    }
  };

  const getToastColor = (type: ToastType) => {
    switch (type) {
      case 'success': return '#22C55E';
      case 'error':   return colors.danger;
      case 'warning': return colors.warning;
      case 'info':    return colors.primary;
    }
  };

  return (
    <Animated.View style={[styles.toastContainer, { transform: [{ translateY }], opacity }]} pointerEvents="box-none">
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={hideToast}
        style={styles.toastBox}
      >
        <Feather name={getToastIcon(toast.type)} size={18} color={getToastColor(toast.type)} />
        <View style={styles.toastTextWrap}>
          <Text style={styles.toastText} numberOfLines={2}>{toast.message}</Text>
          {toast.subtitle ? (
            <Text style={styles.toastSubtitle} numberOfLines={1}>{toast.subtitle}</Text>
          ) : null}
        </View>
        <TouchableOpacity onPress={hideToast} hitSlop={10} style={styles.closeBtn}>
          <Feather name="x" size={14} color={colors.mutedForeground} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  } as any,
  toastBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 100,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    gap: 10,
    maxWidth: '90%',
    ...shadows.md,
  },
  toastTextWrap: {
    flexShrink: 1,
    gap: 2,
  },
  toastText: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  toastSubtitle: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '500',
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
});
