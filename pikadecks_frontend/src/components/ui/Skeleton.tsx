import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius } from '@/constants/theme';

interface SkeletonProps {
  style?: ViewStyle;
}

/**
 * Shimmer skeleton — a horizontal gloss sweep animates left→right
 * on a muted base, matching the Uber / Linear loading aesthetic.
 */
export function Skeleton({ style }: SkeletonProps) {
  const shimmerX = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmerX, {
        toValue: 2,
        duration: 1200,
        useNativeDriver: true,
      })
    ).start();
  }, [shimmerX]);

  return (
    <View style={[styles.base, style]}>
      {/* Moving gloss strip */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [
              {
                translateX: shimmerX.interpolate({
                  inputRange: [-1, 2],
                  outputRange: ['-100%' as unknown as number, '200%' as unknown as number],
                }),
              },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={[
            'transparent',
            'rgba(255,255,255,0.55)',
            'rgba(255,255,255,0.75)',
            'rgba(255,255,255,0.55)',
            'transparent',
          ]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.muted,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
});
