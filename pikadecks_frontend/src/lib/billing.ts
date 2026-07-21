import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import type { Purchase, PurchaseError, Subscription } from 'react-native-iap'

import { readJsonResponse } from '@/lib/api-debug'
import { addBreadcrumb, captureException } from '@/lib/errors'

export const PRO_SUBSCRIPTION_IDS = ['pikadecks_pro_monthly', 'pikadecks_yearly_pack'] as const
export type ProProductId = typeof PRO_SUBSCRIPTION_IDS[number]
const ANDROID_PACKAGE_NAME =
  (Constants as { applicationId?: string }).applicationId ??
  Constants.expoConfig?.android?.package ??
  'com.nameisrk.pikadecks'

export type BillingProduct = {
  productId: ProProductId
  title: string
  description?: string
  price: string
  billingPeriod: string
  offerToken?: string
}

export type SubscriptionStatus = {
  is_pro: boolean
  plan: 'free' | 'pro'
  subscription?: {
    id?: string
    product_id?: string
    status?: string
    expires_at?: string
    platform?: string
  } | null
}

type TokenGetter = () => Promise<string | null>

const SUBSCRIPTION_STATUS_KEY = 'pikadecks.subscription_status'
let billingInitialized = false
let purchaseListener: { remove: () => void } | null = null
let errorListener: { remove: () => void } | null = null
let purchaseHandler: ((purchase: Purchase) => void) | null = null
let purchaseErrorHandler: ((error: PurchaseError) => void) | null = null
let billingNativeUnavailable = false
let currentSubscriptionStatus: SubscriptionStatus | null = null
let refreshStatusPromise: Promise<SubscriptionStatus> | null = null
const subscriptionStatusListeners = new Set<(status: SubscriptionStatus | null) => void>()

type IAPCompat = typeof import('react-native-iap') & {
  fetchProducts?: (input: { skus: string[]; type?: 'in-app' | 'subs' | 'all' }) => Promise<Subscription[] | null | undefined>
  getSubscriptions?: (input: { skus: string[] } | string[]) => Promise<Subscription[] | null | undefined>
  requestPurchase?: (input: {
    type?: 'subs' | 'in-app'
    request?: {
      google?: {
        skus: string[]
        subscriptionOffers?: Array<{ sku: string; offerToken: string }>
      }
    }
    sku?: string
    subscriptionOffers?: Array<{ sku: string; offerToken: string }>
  }) => Promise<void>
  requestSubscription?: (
    input: { sku: string; subscriptionOffers?: Array<{ sku: string; offerToken: string }> } | string
  ) => Promise<void>
  flushFailedPurchasesCachedAsPendingAndroid?: () => Promise<void>
}

function getIap(): IAPCompat | null {
  if (Platform.OS !== 'android') return null
  try {
    return require('react-native-iap') as IAPCompat
  } catch (error) {
    warnBillingStep('loadIapModule', error)
    return null
  }
}

export function isBillingEnabled() {
  return process.env.EXPO_PUBLIC_ENABLE_BILLING === 'true'
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

export function isNativeBillingUnavailable(error: unknown) {
  const message = getErrorMessage(error).toLowerCase()
  return (
    message.includes('undefined is not a function') ||
    message.includes('failed to initialize connection') ||
    message.includes('failed to initialize billing connection') ||
    message.includes('init-connection') ||
    message.includes('nitro') ||
    message.includes('hybridobject') ||
    message.includes('native module') ||
    message.includes('billing is unavailable')
  )
}

function warnBillingStep(step: string, error: unknown) {
  const message = getErrorMessage(error)
  console.warn(`[Billing] ${step} failed`, message)
  addBreadcrumb('Google Play Billing step failed', { step, message }, 'billing')
}

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function notifySubscriptionStatus(status: SubscriptionStatus | null) {
  currentSubscriptionStatus = status
  for (const listener of subscriptionStatusListeners) {
    listener(status)
  }
}

export function subscribeSubscriptionStatus(listener: (status: SubscriptionStatus | null) => void) {
  subscriptionStatusListeners.add(listener)
  listener(currentSubscriptionStatus)
  return () => {
    subscriptionStatusListeners.delete(listener)
  }
}

export function getCurrentSubscriptionStatus() {
  return currentSubscriptionStatus
}

function getPurchaseProductId(purchase: Purchase): ProProductId | null {
  const productId = purchase.productId ?? purchase.productIds?.[0]
  return PRO_SUBSCRIPTION_IDS.includes(productId as ProProductId) ? productId as ProProductId : null
}

function normalizePeriod(period?: string) {
  if (!period) return 'Subscription'
  if (period === 'P1M') return 'Monthly'
  if (period === 'P1Y') return 'Yearly'
  return period
}

function getAndroidOffer(product: Subscription) {
  return product.subscriptionOfferDetailsAndroid?.[0] ?? product.subscriptionOffersAndroid?.[0]
}

function normalizeProduct(product: Subscription): BillingProduct | null {
  const productId = (product.productId ?? product.id) as ProProductId | undefined
  if (!productId || !PRO_SUBSCRIPTION_IDS.includes(productId)) return null

  const offer = getAndroidOffer(product)
  const pricing = offer?.pricingPhases?.pricingPhaseList?.[0]
  const price =
    pricing?.formattedPrice ??
    product.localizedPrice ??
    product.displayPrice ??
    (product.price ? String(product.price) : 'Unavailable')

  return {
    productId,
    title:
      product.displayName ??
      product.title ??
      product.name ??
      'PikaDecks Pro Monthly',
    description: product.description,
    price,
    billingPeriod: normalizePeriod(pricing?.billingPeriod ?? product.subscriptionPeriodAndroid),
    offerToken: offer?.offerToken ?? offer?.offerTokenAndroid,
  }
}

async function authHeaders(getToken: TokenGetter) {
  const token = await getToken()
  if (!token) throw new Error('Missing authentication token.')
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function postBilling<T>(path: string, getToken: TokenGetter, body?: unknown): Promise<T> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL
  if (!apiUrl) throw new Error('Missing API URL.')

  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: await authHeaders(getToken),
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await readJsonResponse(response)
  if (!response.ok) {
    const message =
      typeof data?.detail === 'string'
        ? data.detail
        : typeof data?.message === 'string'
          ? data.message
          : `Billing request failed: HTTP ${response.status}`
    throw new Error(message)
  }
  return data
}

export async function saveSubscriptionStatus(status: SubscriptionStatus) {
  const previous = currentSubscriptionStatus ? JSON.stringify(currentSubscriptionStatus) : ''
  const next = JSON.stringify(status)
  await SecureStore.setItemAsync(SUBSCRIPTION_STATUS_KEY, JSON.stringify(status))
  if (previous !== next) {
    notifySubscriptionStatus(status)
    try {
      const { queryClient } = require('./react-query')
      queryClient.invalidateQueries({ queryKey: ['subscription-status'] })
    } catch {
      // ignore
    }
  } else {
    currentSubscriptionStatus = status
  }
}

export async function getCachedSubscriptionStatus(): Promise<SubscriptionStatus | null> {
  const raw = await SecureStore.getItemAsync(SUBSCRIPTION_STATUS_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SubscriptionStatus
  } catch {
    return null
  }
}

export async function refreshSubscriptionStatus(getToken: TokenGetter) {
  if (refreshStatusPromise) return refreshStatusPromise

  addBreadcrumb('Subscription status refresh requested', undefined, 'billing')
  refreshStatusPromise = refreshSubscriptionStatusOnce(getToken).finally(() => {
    refreshStatusPromise = null
  })
  return refreshStatusPromise
}

async function refreshSubscriptionStatusOnce(getToken: TokenGetter) {
  if (!isBillingEnabled()) {
    const disabledStatus: SubscriptionStatus = { is_pro: false, plan: 'free', subscription: null }
    await saveSubscriptionStatus(disabledStatus)
    return disabledStatus
  }
  const status = await postBilling<SubscriptionStatus>('/billing/subscription-status', getToken)
  await saveSubscriptionStatus(status)
  return status
}

export async function initializeBilling(getToken: TokenGetter) {
  if (!isBillingEnabled()) return false
  if (Platform.OS !== 'android') return false
  if (billingNativeUnavailable) return false
  const iap = getIap()
  if (!iap) return false
  if (typeof iap.initConnection !== 'function') return false
  if (!billingInitialized) {
    try {
      billingInitialized = await iap.initConnection()
    } catch (error) {
      warnBillingStep('initConnection', error)
      if (isNativeBillingUnavailable(error)) {
        billingNativeUnavailable = true
        return false
      }
      throw error
    }
    if (typeof iap.flushFailedPurchasesCachedAsPendingAndroid === 'function') {
      await iap.flushFailedPurchasesCachedAsPendingAndroid().catch((error) => {
        warnBillingStep('flushFailedPurchasesCachedAsPendingAndroid', error)
      })
    }
  }

  if (!purchaseListener && typeof iap.purchaseUpdatedListener === 'function') {
    try {
      purchaseListener = iap.purchaseUpdatedListener((purchase) => {
        purchaseHandler?.(purchase)
      })
    } catch (error) {
      warnBillingStep('purchaseUpdatedListener', error)
    }
  }

  if (!errorListener && typeof iap.purchaseErrorListener === 'function') {
    try {
      errorListener = iap.purchaseErrorListener((error: PurchaseError) => {
        addBreadcrumb('Google Play purchase error', {
          code: error.code,
          message: error.message,
        }, 'billing')
        purchaseErrorHandler?.(error)
      })
    } catch (error) {
      warnBillingStep('purchaseErrorListener', error)
    }
  }

  await restorePurchases(getToken).catch((error) => {
    warnBillingStep('startup_restore_purchases', error)
    if (!isNativeBillingUnavailable(error)) {
      captureException(error, { feature: 'billing', action: 'startup_restore_purchases' })
    }
  })
  return billingInitialized
}

export async function loadSubscriptionProducts(): Promise<BillingProduct[]> {
  if (Platform.OS !== 'android') return []
  if (billingNativeUnavailable) return []
  const iap = getIap()
  if (!iap) return []
  if (typeof iap.initConnection !== 'function') return []
  if (!billingInitialized) {
    try {
      billingInitialized = await iap.initConnection()
    } catch (error) {
      warnBillingStep('loadProducts.initConnection', error)
      if (isNativeBillingUnavailable(error)) {
        billingNativeUnavailable = true
      }
      return []
    }
  }

  let products: Subscription[] = []
  try {
    if (typeof iap.fetchProducts === 'function') {
      products = asArray(await iap.fetchProducts({ skus: [...PRO_SUBSCRIPTION_IDS], type: 'subs' }))
    } else if (typeof iap.getSubscriptions === 'function') {
      products = asArray(await iap.getSubscriptions({ skus: [...PRO_SUBSCRIPTION_IDS] }))
    }
  } catch (error) {
    warnBillingStep('fetchProducts', error)
    return []
  }
  try {
    return products.map(normalizeProduct).filter((product): product is BillingProduct => !!product)
  } catch (error) {
    warnBillingStep('normalizeProducts', error)
    return []
  }
}

export function onPurchaseUpdated(handler: (purchase: Purchase) => void) {
  purchaseHandler = handler
  return () => {
    if (purchaseHandler === handler) purchaseHandler = null
  }
}

export function onPurchaseError(handler: (error: PurchaseError) => void) {
  purchaseErrorHandler = handler
  return () => {
    if (purchaseErrorHandler === handler) purchaseErrorHandler = null
  }
}

export async function verifyPurchaseWithBackend(purchase: Purchase, getToken: TokenGetter) {
  const productId = getPurchaseProductId(purchase)
  if (!productId || !purchase.purchaseToken) {
    throw new Error('Purchase is missing subscription details.')
  }

  addBreadcrumb('Google Play purchase verification started', {
    product_id: productId,
    transaction_id: purchase.transactionId,
  }, 'billing')
  const status = await postBilling<SubscriptionStatus>('/billing/verify-subscription', getToken, {
    productId,
    purchaseToken: purchase.purchaseToken,
    packageName: ANDROID_PACKAGE_NAME,
    transactionId: purchase.transactionId,
    purchaseTime: purchase.transactionDate
      ? new Date(Number(purchase.transactionDate)).toISOString()
      : undefined,
  })
  await saveSubscriptionStatus(status)
  addBreadcrumb('Google Play purchase verification completed', {
    product_id: productId,
    transaction_id: purchase.transactionId,
    is_pro: status.is_pro,
    subscription_status: status.subscription?.status,
  }, 'billing')
  const iap = getIap()
  if (iap && typeof iap.finishTransaction === 'function') {
    await iap.finishTransaction({ purchase, isConsumable: false })
  }
  return status
}

export async function purchaseSubscription(product: BillingProduct, userId?: string) {
  if (Platform.OS !== 'android') {
    throw new Error('Google Play subscriptions are available on Android builds.')
  }
  if (billingNativeUnavailable) {
    throw new Error('Google Play Billing is not available on this device right now.')
  }
  const iap = getIap()
  if (!iap) {
    throw new Error('Google Play Billing is not available in this app build.')
  }

  addBreadcrumb('Google Play purchase requested', {
    product_id: product.productId,
    has_offer_token: Boolean(product.offerToken),
  }, 'billing')
  if (typeof iap.requestPurchase === 'function') {
    await iap.requestPurchase({
      type: 'subs',
      request: {
        google: {
          skus: [product.productId],
          subscriptionOffers: product.offerToken
            ? [{ sku: product.productId, offerToken: product.offerToken }]
            : undefined,
          obfuscatedAccountId: userId,
          obfuscatedProfileId: userId,
        } as any,
      },
    })
    return
  }

  if (typeof iap.requestSubscription === 'function') {
    if (product.offerToken) {
      await iap.requestSubscription({
        sku: product.productId,
        subscriptionOffers: [{ sku: product.productId, offerToken: product.offerToken }],
        obfuscatedAccountId: userId,
        obfuscatedProfileId: userId,
      } as any)
      return
    }
    await iap.requestSubscription({ 
      sku: product.productId,
      obfuscatedAccountId: userId,
      obfuscatedProfileId: userId,
    } as any)
    return
  }

  throw new Error('Google Play Billing is not available in this app build.')
}

export async function restorePurchases(getToken: TokenGetter) {
  if (Platform.OS !== 'android') return null
  if (billingNativeUnavailable) return refreshSubscriptionStatus(getToken)
  const iap = getIap()
  if (!iap) return refreshSubscriptionStatus(getToken)
  if (typeof iap.getAvailablePurchases !== 'function') return refreshSubscriptionStatus(getToken)
  let purchases: Purchase[] = []
  try {
    purchases = asArray(await iap.getAvailablePurchases({ includeSuspendedAndroid: true }))
  } catch (error) {
    warnBillingStep('getAvailablePurchases', error)
    return refreshSubscriptionStatus(getToken)
  }
  const proPurchase = purchases.find((purchase) => {
    const productId = getPurchaseProductId(purchase)
    return !!productId && !!purchase.purchaseToken
  })
  if (!proPurchase) return refreshSubscriptionStatus(getToken)
  return verifyPurchaseWithBackend(proPurchase, getToken)
}

export async function endBillingConnection() {
  purchaseListener?.remove()
  errorListener?.remove()
  purchaseListener = null
  errorListener = null
  purchaseHandler = null
  purchaseErrorHandler = null
  if (billingInitialized) {
    await finishSafeEndConnection()
  }
}

async function finishSafeEndConnection() {
  try {
    const iap = getIap()
    if (iap && typeof iap.endConnection === 'function') {
      await iap.endConnection()
    }
  } finally {
    billingInitialized = false
  }
}
