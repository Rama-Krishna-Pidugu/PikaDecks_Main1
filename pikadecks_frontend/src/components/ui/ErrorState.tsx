import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius } from '@/constants/theme';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  style?: ViewStyle;
}

export function ErrorState({ 
  title = 'Something went wrong', 
  message = 'We encountered an unexpected error. Please try again.', 
  onRetry,
  style 
}: ErrorStateProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconContainer}>
        <Feather name="alert-triangle" size={32} color={colors.danger} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      
      {onRetry && (
        <TouchableOpacity style={styles.button} activeOpacity={0.8} onPress={onRetry}>
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.foreground,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 12,
  },
  button: {
    backgroundColor: colors.muted,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
  },
  buttonText: {
    color: colors.foreground,
    fontWeight: '800',
    fontSize: 15,
  },
});
