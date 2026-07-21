import { PropsWithChildren } from 'react';
import { Text, TouchableOpacity, View, Image } from 'react-native';
import { ErrorBoundary } from '@sentry/react-native';
import { colors, radius, shadows } from '@/constants/theme';
import { pikaAssets } from '@/constants/assets';

function Fallback({ resetError }: { resetError: () => void }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        gap: 16,
        backgroundColor: colors.background,
      }}
    >
      <Image 
        source={pikaAssets.frustration}
        style={{ width: 120, height: 120, opacity: 0.8, marginBottom: 8 }} 
        resizeMode="contain" 
      />
      <Text style={{ color: colors.foreground, fontSize: 24, fontWeight: '800', textAlign: 'center' }}>
        Oops! Something broke.
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 12 }}>
        An unexpected error occurred. The technical details have been logged for our team to fix.
      </Text>
      <TouchableOpacity
        onPress={resetError}
        style={{
          backgroundColor: colors.primary,
          borderRadius: radius['2xl'],
          paddingHorizontal: 32,
          paddingVertical: 16,
          ...shadows.md,
        }}
        activeOpacity={0.8}
      >
        <Text style={{ color: colors.primaryForeground, fontWeight: '800', fontSize: 16 }}>Restart App</Text>
      </TouchableOpacity>
    </View>
  );
}

export function AppErrorBoundary({ children }: PropsWithChildren) {
  return <ErrorBoundary fallback={({ resetError }) => <Fallback resetError={resetError} />}>{children}</ErrorBoundary>;
}
