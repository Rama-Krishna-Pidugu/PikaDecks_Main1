import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius } from '@/constants/theme';

interface EmptyStateProps {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
  buttonText?: string;
  onButtonPress?: () => void;
  style?: ViewStyle;
}

export function EmptyState({ icon = 'inbox', title, description, buttonText, onButtonPress, style }: EmptyStateProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconContainer}>
        <Feather name={icon} size={32} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      
      {buttonText && onButtonPress && (
        <TouchableOpacity style={styles.button} activeOpacity={0.8} onPress={onButtonPress}>
          <Text style={styles.buttonText}>{buttonText}</Text>
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
    backgroundColor: 'rgba(255, 122, 0, 0.1)',
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
  description: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 12,
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: radius['2xl'],
    marginTop: 8,
  },
  buttonText: {
    color: colors.primaryForeground,
    fontWeight: '800',
    fontSize: 15,
  },
});
