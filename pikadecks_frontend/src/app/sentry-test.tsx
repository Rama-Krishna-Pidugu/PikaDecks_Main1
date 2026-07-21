import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { captureException, captureMessage, addBreadcrumb } from '@/lib/errors';
import { colors, radius, shadows } from '@/constants/theme';

export default function SentryTestScreen() {
  const throwRenderError = () => {
    addBreadcrumb('Sentry test render error button pressed', undefined, 'sentry_test');
    throw new Error('Sentry test JavaScript exception from PikaDecks');
  };

  const captureHandledError = () => {
    addBreadcrumb('Sentry test handled exception captured', undefined, 'sentry_test');
    captureException(new Error('Sentry test handled exception from PikaDecks'), {
      feature: 'sentry_test',
      action: 'capture_exception',
    });
  };

  const captureTestMessage = () => {
    addBreadcrumb('Sentry test message captured', undefined, 'sentry_test');
    captureMessage('Sentry test message from PikaDecks', {
      feature: 'sentry_test',
      action: 'capture_message',
    });
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Sentry Test' }} />
      <Text style={styles.title}>Sentry Test</Text>
      <Text style={styles.copy}>
        Use these buttons only in development or preview builds to verify Sentry ingestion.
      </Text>

      <TouchableOpacity style={styles.button} onPress={captureTestMessage}>
        <Text style={styles.buttonText}>Capture test message</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={captureHandledError}>
        <Text style={styles.buttonText}>Capture handled exception</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={throwRenderError}>
        <Text style={styles.buttonText}>Throw test error</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 14,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.foreground,
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
  },
  copy: {
    color: colors.mutedForeground,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius['2xl'],
    paddingVertical: 15,
    alignItems: 'center',
    ...shadows.pop,
  },
  dangerButton: {
    backgroundColor: colors.danger,
  },
  buttonText: {
    color: colors.primaryForeground,
    fontSize: 15,
    fontWeight: '800',
  },
});
