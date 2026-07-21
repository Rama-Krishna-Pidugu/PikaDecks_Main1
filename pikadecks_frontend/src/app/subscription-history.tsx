import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-expo'
import { useRouter } from 'expo-router'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { AuthenticatedShell, ui } from '@/components/authenticated-shell'
import { colors, radius } from '@/constants/theme'
import { useBillingHistory } from '@/hooks/useBillingHistory'

export default function SubscriptionHistoryPage() {
  const { getToken } = useAuth()
  const getTokenRef = useRef(getToken)
  const getSubscriptionToken = useCallback(() => getTokenRef.current(), [])
  const router = useRouter()
  const { data: historyData, isLoading } = useBillingHistory(getSubscriptionToken)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    getTokenRef.current = getToken
  }, [getToken])

  const handleCopyTx = (txId: string, itemId: string) => {
    const { Clipboard } = require('react-native')
    Clipboard.setString(txId)
    setCopiedId(itemId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'N/A'
    try {
      const date = new Date(isoString)
      return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    } catch {
      return isoString
    }
  }

  const history = historyData?.history || []

  return (
    <AuthenticatedShell title="Billing History" subtitle="Your transactions and orders" hideHeader>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View>
          <Text style={styles.title}>Subscription History</Text>
          <Text style={styles.subtitle}>Detailed record of your payment orders</Text>
        </View>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        ) : history.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="credit-card" size={48} color={colors.mutedForeground} style={{ opacity: 0.6, marginBottom: 12 }} />
            <Text style={styles.emptyTitle}>No transaction history</Text>
            <Text style={styles.emptySub}>You have no recorded payments on this account yet.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {history.map((item: any) => {
              const txId = item.transaction_id || item.id
              return (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.planName}>{item.plan_name}</Text>
                        <View
                          style={[
                            styles.statusBadge,
                            item.status === 'active' ? styles.statusBadgeActive : styles.statusBadgeCancelled,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusText,
                              item.status === 'active' ? styles.statusTextActive : styles.statusTextCancelled,
                            ]}
                          >
                            {item.status}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.dateText}>{formatDate(item.purchase_date)}</Text>
                    </View>
                    <View style={styles.amountContainer}>
                      <Text style={styles.amountText}>₹{item.amount}</Text>
                      <Text style={styles.providerText}>
                        via {item.provider === 'google_play' ? 'Google Play' : 'Razorpay'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardFooter}>
                    <View style={styles.txRow}>
                      <Text style={styles.txLabel}>Transaction ID</Text>
                      <View style={styles.txContainer}>
                        <Text style={styles.txValue} numberOfLines={1} ellipsizeMode="middle">
                          {txId}
                        </Text>
                        {txId ? (
                          <Pressable
                            onPress={() => handleCopyTx(txId, item.id)}
                            style={styles.copyButton}
                          >
                            <Feather
                              name={copiedId === item.id ? 'check' : 'copy'}
                              size={12}
                              color={copiedId === item.id ? '#10b981' : colors.mutedForeground}
                            />
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
    </AuthenticatedShell>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.foreground,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginTop: 2,
  },
  loader: {
    marginTop: 40,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius['3xl'],
    backgroundColor: colors.card,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.foreground,
  },
  emptySub: {
    fontSize: 12,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: 4,
  },
  list: {
    gap: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius['3xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingBottom: 12,
  },
  planName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.foreground,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeActive: {
    backgroundColor: '#e6f4ea',
  },
  statusBadgeCancelled: {
    backgroundColor: '#f3f4f6',
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusTextActive: {
    color: '#137333',
  },
  statusTextCancelled: {
    color: '#6b7280',
  },
  dateText: {
    fontSize: 11,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.foreground,
  },
  providerText: {
    fontSize: 10,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  cardFooter: {
    paddingTop: 12,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.mutedForeground,
    textTransform: 'uppercase',
  },
  txContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '60%',
  },
  txValue: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 10,
    fontWeight: '600',
    color: colors.foreground,
    flex: 1,
  },
  copyButton: {
    padding: 2,
  },
})
