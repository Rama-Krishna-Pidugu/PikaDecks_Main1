import { useCallback, useEffect, useRef } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useAuth } from '@clerk/clerk-expo'

import { AuthenticatedShell } from '@/components/authenticated-shell'
import { colors, radius, shadows } from '@/constants/theme'
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus'
import { analyticsEvents } from '@/lib/firebase'

export default function PurchaseSuccessPage() {
  const { getToken } = useAuth()
  const getTokenRef = useRef(getToken)
  const getSubscriptionToken = useCallback(() => getTokenRef.current(), [])
  const { status, loading, refresh } = useSubscriptionStatus(getSubscriptionToken, false)

  useEffect(() => {
    getTokenRef.current = getToken
  }, [getToken])

  const loadStatus = useCallback(async () => {
    const latest = await refresh()
    if (latest.subscription?.status === 'active') {
      void analyticsEvents.subscriptionPurchased(latest.subscription.product_id, latest.subscription.status)
    }
  }, [refresh])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  return (
    <AuthenticatedShell title="Pro Active" subtitle="Google Play subscription">
      <View style={styles.body}>
        <View style={styles.card}>
          <View style={styles.icon}>
            <Feather name="check-circle" size={34} color="#047857" />
          </View>
          <Text style={styles.title}>
            {loading ? 'Verifying Pro access' : status?.is_pro ? 'PikaDecks Pro is active' : 'Verification pending'}
          </Text>
          <Text style={styles.text}>
            {status?.is_pro
              ? 'Unlimited PDF processing, YouTube flashcards, flashcard generation, and priority processing are ready.'
              : 'If Google Play completed the purchase, tap refresh to check your verified entitlement.'}
          </Text>
          {loading ? <ActivityIndicator color={colors.primary} /> : null}
          <Pressable style={styles.primaryButton} onPress={() => router.replace('/home' as any)}>
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
          {!status?.is_pro && !loading ? (
            <Pressable style={styles.secondaryButton} onPress={() => void loadStatus()}>
              <Feather name="refresh-cw" size={15} color={colors.primary} />
              <Text style={styles.secondaryText}>Refresh status</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </AuthenticatedShell>
  )
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    alignItems: 'center',
    gap: 14,
    ...shadows.soft,
  },
  icon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  text: {
    color: colors.mutedForeground,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  primaryButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: radius['2xl'],
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.pop,
  },
  primaryText: {
    color: colors.primaryForeground,
    fontWeight: '900',
    fontSize: 15,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  secondaryText: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 13,
  },
})
