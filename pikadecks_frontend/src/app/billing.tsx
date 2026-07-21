import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { useToast } from '@/components/ui/ToastProvider'
import { useAuth } from '@clerk/clerk-expo'
import { router } from 'expo-router'

import { pikaAssets } from '@/constants/assets'
import { colors, radius, shadows } from '@/constants/theme'
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus'
import {
  initializeBilling,
  isBillingEnabled,
  isNativeBillingUnavailable,
  loadSubscriptionProducts,
  onPurchaseError,
  onPurchaseUpdated,
  purchaseSubscription,
  restorePurchases,
  verifyPurchaseWithBackend,
  type BillingProduct,
} from '@/lib/billing'
import { captureException } from '@/lib/errors'
import { analyticsEvents } from '@/lib/firebase'

const FEATURES = [
  {
    icon: 'cpu' as const,
    title: 'Instant AI Flashcards',
    text: 'Turn PDFs, notes, videos and screenshots into flashcards.',
  },
  {
    icon: 'layers' as const,
    title: 'Unlimited AI Generation',
    text: 'Create unlimited study material.',
  },
  {
    icon: 'zap' as const,
    title: 'Priority Processing',
    text: 'Your AI requests are processed faster.',
  }
]

type PlanOption = {
  id: string
  badge?: string
  finePrint: string
  period: string
  price: string
  product?: BillingProduct
  title: string
  yearly: boolean
}

const FALLBACK_PLANS: PlanOption[] = [
  {
    id: 'annual-placeholder',
    badge: 'Best Value',
    finePrint: 'Only $6.66/mo',
    period: '/yr',
    price: '$79.99',
    title: 'Annual Pro',
    yearly: true,
  },
  {
    id: 'monthly-placeholder',
    finePrint: 'Billed at $9.99/mo.',
    period: '/mo',
    price: '$9.99',
    title: 'Monthly Pro',
    yearly: false,
  },
]

export default function BillingPage() {
  const { getToken, userId } = useAuth()
  const getTokenRef = useRef(getToken)
  const getBillingToken = useCallback(() => getTokenRef.current(), [])
  const { status, refresh: refreshStatus } = useSubscriptionStatus(getBillingToken, false)
  const [products, setProducts] = useState<BillingProduct[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState(FALLBACK_PLANS[0].id)
  const [loading, setLoading] = useState(true)
  const [purchaseState, setPurchaseState] = useState<'idle' | 'purchasing' | 'verifying'>('idle')
  const [restoring, setRestoring] = useState(false)
  const fadeAnim = useRef(new Animated.Value(0)).current
  const { showToast } = useToast()

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start()
  }, [fadeAnim])

  useEffect(() => {
    getTokenRef.current = getToken
  }, [getToken])

  const plans = useMemo(() => {
    if (!products.length) return FALLBACK_PLANS

    return [...products]
      .sort((a, b) => Number(isYearly(b)) - Number(isYearly(a)))
      .map((product) => {
        const yearly = isYearly(product)
        return {
          id: product.productId,
          badge: yearly ? 'Best Value' : undefined,
          finePrint: yearly ? 'Best value for focused learners' : 'Billed monthly.',
          period: yearly ? '/yr' : '/mo',
          price: product.price,
          product,
          title: yearly ? 'Annual Pro' : 'Monthly Pro',
          yearly,
        }
      })
  }, [products])

  const selectedPlan = useMemo(() => {
    return plans.find((plan) => plan.id === selectedPlanId) ?? plans[0]
  }, [plans, selectedPlanId])

  const loadBilling = useCallback(async () => {
    try {
      if (!isBillingEnabled()) {
        setProducts([])
        return
      }
      await initializeBilling(getTokenRef.current)
      const [loadedProducts] = await Promise.all([
        loadSubscriptionProducts(),
        refreshStatus(),
      ])
      setProducts(loadedProducts)
      const firstProduct = loadedProducts.find(isYearly) ?? loadedProducts[0]
      if (firstProduct) setSelectedPlanId(firstProduct.productId)
    } catch (error) {
      if (!isNativeBillingUnavailable(error)) {
        captureException(error, { feature: 'billing', action: 'load_billing_screen' })
      }
      showToast(error instanceof Error ? error.message : 'Could not load subscriptions.', 'error')
    } finally {
      setLoading(false)
    }
  }, [refreshStatus])

  useEffect(() => {
    void analyticsEvents.subscriptionViewed()
    void loadBilling()
  }, [loadBilling])

  useEffect(() => {
    return onPurchaseUpdated((purchase) => {
      setPurchaseState('verifying')
      void verifyPurchaseWithBackend(purchase, getTokenRef.current)
        .then((latestStatus) => {
          void analyticsEvents.subscriptionPurchased(
            latestStatus.subscription?.product_id,
            latestStatus.subscription?.status,
          )
          setPurchaseState('idle')
          router.replace('/purchase-success' as any)
        })
        .catch((error) => {
          void analyticsEvents.subscriptionFailed(undefined, error instanceof Error ? error.message : 'verification_failed')
          captureException(error, { feature: 'billing', action: 'verify_purchase_listener' })
          showToast(error instanceof Error ? error.message : 'Could not verify purchase.', 'error')
          setPurchaseState('idle')
        })
    })
  }, [])

  useEffect(() => {
    return onPurchaseError((error) => {
      setPurchaseState('idle')
      const code = String(error?.code || '')
      if (!code.includes('USER_CANCELED') && !code.includes('E_USER_CANCELLED')) {
        showToast(error.message || 'An error occurred during the purchase.', 'error')
      }
    })
  }, [])

  const buy = async () => {
    if (status?.is_pro || purchaseState !== 'idle') return
    if (!selectedPlan?.product) {
      showToast(
        isBillingEnabled()
          ? 'Plans unavailable from Google Play yet.'
          : 'Billing is disabled for this build.',
        'warning',
      );
      return
    }

    try {
      setPurchaseState('purchasing')
      await analyticsEvents.subscriptionStarted(selectedPlan.product.productId)
      await purchaseSubscription(selectedPlan.product, userId || undefined)
    } catch (error: any) {
      setPurchaseState('idle')
      const code = String(error?.code || '')
      if (code.includes('USER_CANCELED') || code.includes('E_USER_CANCELLED')) {
        await analyticsEvents.subscriptionCancelled(selectedPlan.product.productId)
        return
      }
      await analyticsEvents.subscriptionFailed(selectedPlan.product.productId, code || 'purchase_start_failed')
      if (!isNativeBillingUnavailable(error)) {
        captureException(error, { feature: 'billing', action: 'purchase_subscription', extra: { product_id: selectedPlan.product.productId } })
      }
      showToast(error instanceof Error ? error.message : 'Could not start purchase.', 'error')
    }
  }

  const restore = async () => {
    try {
      setRestoring(true)
      const latestStatus = await restorePurchases(getTokenRef.current)
      const msg = latestStatus?.is_pro
        ? 'Your Pro access is active.'
        : 'No active Pro purchase was found.';
      showToast(msg, latestStatus?.is_pro ? 'success' : 'warning');
    } catch (error) {
      if (!isNativeBillingUnavailable(error)) {
        captureException(error, { feature: 'billing', action: 'restore_purchases' })
      }
      showToast(error instanceof Error ? error.message : 'Could not restore purchases.', 'error')
    } finally {
      setRestoring(false)
    }
  }

  const close = () => {
    if (router.canGoBack()) {
      router.back()
      return
    }
    router.replace('/home' as any)
  }

  if (status?.is_pro) {
    const sub = status.subscription;
    const isCancelled = sub?.status === 'cancelled';
    const isGracePeriod = sub?.status === 'grace_period' || sub?.status === 'in_grace_period';
    
    const formatDate = (isoString?: string) => {
      if (!isoString) return 'N/A';
      try {
        const date = new Date(isoString);
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      } catch {
        return isoString;
      }
    };

    const manageSubscription = () => {
      const { Linking } = require('react-native');
      if (sub?.platform === 'android') {
        const sku = sub?.product_id || 'pikadecks_pro_monthly';
        const url = `https://play.google.com/store/account/subscriptions?package=com.nameisrk.pikadecks&sku=${sku}`;
        Linking.openURL(url).catch((err: any) => console.error("Couldn't open subscription link", err));
      } else {
        Linking.openURL('https://pikadecks.app/support').catch((err: any) => console.error("Couldn't open billing link", err));
      }
    };

    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.content}>
          <Pressable onPress={close} hitSlop={10} style={styles.closeButton}>
            <Feather name="x" size={20} color={colors.foreground} />
          </Pressable>

          <Image source={pikaAssets.superPika} resizeMode="contain" style={styles.heroImage} />

          <Text style={styles.title}>Your Pro Subscription</Text>
          <Text style={styles.subtitle}>
            You have full access to all PikaDecks Pro features.
          </Text>

          {isCancelled && sub?.expires_at ? (
            <View style={{ backgroundColor: '#fffbeb', borderColor: '#fef3c7', borderWidth: 1, padding: 16, borderRadius: radius.xl, gap: 8, marginTop: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="alert-triangle" size={16} color="#d97706" />
                <Text style={{ color: '#b45309', fontWeight: 'bold', fontSize: 13 }}>Subscription Cancelled</Text>
              </View>
              <Text style={{ color: '#b45309', fontSize: 12, lineHeight: 18 }}>
                Your Pro membership remains active until {formatDate(sub.expires_at)}.
              </Text>
            </View>
          ) : null}

          {isGracePeriod ? (
            <View style={{ backgroundColor: '#fef2f2', borderColor: '#fee2e2', borderWidth: 1, padding: 16, borderRadius: radius.xl, gap: 8, marginTop: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="alert-circle" size={16} color="#dc2626" />
                <Text style={{ color: '#991b1b', fontWeight: 'bold', fontSize: 13 }}>Payment Issue Detected</Text>
              </View>
              <Text style={{ color: '#991b1b', fontSize: 12, lineHeight: 18 }}>
                There was a problem renewing your subscription. Please update your payment method to avoid losing access.
              </Text>
            </View>
          ) : null}

          <View style={[styles.featureCard, { marginTop: 20 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingBottom: 12 }}>
              <Text style={{ fontWeight: 'bold', color: colors.foreground }}>PikaDecks Pro</Text>
              <View style={{ backgroundColor: isGracePeriod ? '#fde8e8' : '#e6f4ea', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                <Text style={{ color: isGracePeriod ? '#c81e1e' : '#137333', fontSize: 11, fontWeight: 'bold' }}>
                  {isCancelled ? 'CANCELLED' : isGracePeriod ? 'GRACE PERIOD' : 'ACTIVE'}
                </Text>
              </View>
            </View>
            
            <View style={{ gap: 12, marginTop: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Billing Period</Text>
                <Text style={{ fontWeight: '600', fontSize: 13 }}>
                  {sub?.product_id === 'pikadecks_yearly_pack' ? 'Yearly' : 'Monthly'}
                </Text>
              </View>

              {sub?.platform ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Platform</Text>
                  <Text style={{ fontWeight: '600', fontSize: 13, textTransform: 'capitalize' }}>
                    {sub.platform}
                  </Text>
                </View>
              ) : null}

              {!isCancelled && sub?.expires_at ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Renews on</Text>
                  <Text style={{ fontWeight: '600', fontSize: 13 }}>{formatDate(sub.expires_at)}</Text>
                </View>
              ) : null}

              {isCancelled && sub?.expires_at ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Expires on</Text>
                  <Text style={{ fontWeight: '600', fontSize: 13 }}>{formatDate(sub.expires_at)}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <Pressable
            onPress={manageSubscription}
            style={styles.ctaButton}
          >
            <Text style={styles.ctaText}>Manage Subscription</Text>
          </Pressable>

        </View>
      </SafeAreaView>
    );
  }

  const ctaText = status?.is_pro ? 'Pro Active' : 'Start Learning Smarter'
  const isPurchasing = purchaseState !== 'idle'

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <View style={styles.mainContent}>
          <Pressable onPress={close} hitSlop={15} style={styles.closeButton}>
            <Feather name="x" size={18} color={colors.foreground} />
          </Pressable>

          <Image source={pikaAssets.superPika} resizeMode="contain" style={styles.heroImage} />

          <Text style={styles.title}>Turn anything into flashcards</Text>
          <Text style={styles.subtitle}>
            Upload notes, slides, textbooks, or videos and get AI-generated flashcards, quizzes, and summaries in seconds.
          </Text>

          <View style={styles.featureCard}>
            {FEATURES.map((feature) => (
              <View key={feature.title} style={styles.featureRow}>
                <View style={styles.featureIconContainer}>
                  <Feather name={feature.icon} size={16} color="#B77B00" />
                </View>
                <View style={styles.featureCopy}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureText}>{feature.text}</Text>
                </View>
              </View>
            ))}
          </View>

          {loading && isBillingEnabled() ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Loading Google Play plans...</Text>
            </View>
          ) : null}

          {Platform.OS !== 'android' && isBillingEnabled() ? (
            <Text style={styles.notice}>Google Play purchases are available in Android builds.</Text>
          ) : null}

          <View style={styles.planRow}>
            {plans.slice(0, 2).map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                selected={selectedPlan?.id === plan.id}
                onPress={() => setSelectedPlanId(plan.id)}
              />
            ))}
          </View>
        </View>

        <View style={styles.bottomContainer}>
          <Pressable
            disabled={purchaseState !== 'idle' || status?.is_pro}
            onPress={() => void buy()}
            style={[styles.ctaButton, (purchaseState !== 'idle' || status?.is_pro) && styles.disabled]}
          >
            {isPurchasing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.ctaText}>{ctaText}</Text>
            )}
          </Pressable>

          <View style={styles.trustIndicatorsRow}>
            <Feather name="lock" size={12} color={colors.mutedForeground} />
            <Text style={styles.trustText}>Secure payment</Text>
            <Text style={styles.trustDivider}>•</Text>
            <Text style={styles.trustText}>Cancel anytime</Text>
          </View>

          <Pressable disabled={restoring || purchaseState !== 'idle'} onPress={() => void restore()} style={styles.restoreButton}>
            {restoring ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Text style={styles.restoreText}>Restore Purchases</Text>
            )}
          </Pressable>
          
          <View style={styles.footerLinks}>
            <Pressable onPress={() => Linking.openURL('https://pikadecks.app/terms')}>
              <Text style={styles.footerLinkText}>Terms of Service</Text>
            </Pressable>
            <Text style={styles.footerLinkDivider}>•</Text>
            <Pressable onPress={() => Linking.openURL('https://pikadecks.app/privacy')}>
              <Text style={styles.footerLinkText}>Privacy Policy</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </SafeAreaView>
  )
}

function isYearly(product: BillingProduct) {
  const text = `${product.productId} ${product.title} ${product.billingPeriod}`.toLowerCase()
  return text.includes('year') || text.includes('annual') || text.includes('p1y')
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

function PlanCard({
  onPress,
  plan,
  selected,
}: {
  onPress: () => void
  plan: PlanOption
  selected: boolean
}) {
  const scaleAnim = useRef(new Animated.Value(selected ? 1.02 : 1)).current

  useEffect(() => {
    Animated.timing(scaleAnim, {
      toValue: selected ? 1.02 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start()
  }, [selected, scaleAnim])

  return (
    <AnimatedPressable 
      onPress={onPress} 
      style={[
        styles.planCard, 
        selected && styles.planCardSelected,
        { transform: [{ scale: scaleAnim }] }
      ]}
    >
      {plan.badge ? (
        <View style={styles.discountBadge}>
          <Text style={styles.discountText}>{plan.badge}</Text>
        </View>
      ) : null}
      <View style={styles.planHeader}>
        <View style={styles.planCopy}>
          <Text style={styles.planTitle}>{plan.title}</Text>
          <Text style={styles.planPrice}>
            {plan.price}<Text style={styles.planPeriod}>{plan.period}</Text>
          </Text>
        </View>
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected ? <Feather name="check" size={12} color="#FFFFFF" /> : null}
        </View>
      </View>
      <Text style={styles.planFinePrint}>{plan.finePrint}</Text>
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mainContent: {
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingTop: 0,
    paddingBottom: 16,
  },
  closeButton: {
    alignSelf: 'flex-end',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 0,
  },
  heroImage: {
    alignSelf: 'center',
    width: 120,
    height: 120,
    marginTop: 0,
  },
  title: {
    color: colors.foreground,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 6,
  },
  subtitle: {
    color: colors.mutedForeground,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 8,
  },
  featureCard: {
    borderWidth: 1,
    borderColor: '#F7D96B',
    backgroundColor: '#FFFDF1',
    borderRadius: radius['3xl'],
    paddingHorizontal: 20,
    paddingVertical: 22,
    gap: 16,
    marginTop: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  featureIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFF0B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureCopy: {
    flex: 1,
  },
  featureTitle: {
    color: colors.foreground,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  featureText: {
    color: colors.mutedForeground,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    marginTop: 2,
  },
  loadingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  loadingText: {
    color: colors.mutedForeground,
    fontSize: 12,
    fontWeight: '700',
  },
  notice: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 12,
  },
  planRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 28,
  },
  planCard: {
    flex: 1,
    minHeight: 98,
    borderWidth: 1.5,
    borderColor: '#F1D979',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 15,
  },
  planCardSelected: {
    borderColor: '#FFB800',
    backgroundColor: '#FFFDF5',
    ...shadows.soft,
  },
  discountBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    borderRadius: radius.full,
    backgroundColor: '#FFB800',
    paddingHorizontal: 14,
    paddingVertical: 4,
    zIndex: 2,
  },
  discountText: {
    color: colors.foreground,
    fontSize: 11,
    fontWeight: '900',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  planCopy: {
    flex: 1,
  },
  planTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '900',
  },
  planPrice: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 4,
  },
  planPeriod: {
    color: colors.mutedForeground,
    fontSize: 13,
    fontWeight: '700',
  },
  planFinePrint: {
    color: colors.mutedForeground,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    marginTop: 9,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D4D4D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#FFB800',
    backgroundColor: '#FFB800',
  },
  bottomContainer: {
    paddingTop: 16,
    paddingBottom: 4,
  },
  trustIndicatorsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 6,
  },
  trustText: {
    fontSize: 11,
    color: colors.mutedForeground,
    fontWeight: '600',
  },
  trustDivider: {
    fontSize: 11,
    color: colors.mutedForeground,
    fontWeight: '600',
    marginHorizontal: 2,
  },
  ctaButton: {
    minHeight: 54,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    ...shadows.pop,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  restoreButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  restoreText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.72,
  },
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    gap: 12,
  },
  footerLinkText: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  footerLinkDivider: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '600',
  },
})

