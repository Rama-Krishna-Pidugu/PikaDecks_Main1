declare module 'react-native-iap' {
  export type Purchase = {
    productId?: string
    productIds?: string[]
    purchaseToken?: string
    transactionId?: string
    transactionDate?: string | number
  }

  export type Subscription = {
    productId?: string
    id?: string
    title?: string
    name?: string
    displayName?: string
    description?: string
    localizedPrice?: string
    displayPrice?: string
    price?: string | number
    currency?: string
    subscriptionPeriodAndroid?: string
    subscriptionOfferDetailsAndroid?: Array<{
      basePlanId?: string
      offerToken?: string
      offerTokenAndroid?: string
      pricingPhases?: {
        pricingPhaseList?: Array<{
          formattedPrice?: string
          billingPeriod?: string
          recurrenceMode?: number
        }>
      }
    }>
    subscriptionOffersAndroid?: Array<{
      basePlanId?: string
      offerToken?: string
      offerTokenAndroid?: string
      pricingPhases?: {
        pricingPhaseList?: Array<{
          formattedPrice?: string
          billingPeriod?: string
          recurrenceMode?: number
        }>
      }
    }>
  }

  export type PurchaseError = {
    code?: string
    message?: string
  }

  export function initConnection(): Promise<boolean>
  export function endConnection(): Promise<void>
  export function flushFailedPurchasesCachedAsPendingAndroid(): Promise<void>
  export function fetchProducts(input: { skus: string[]; type?: 'in-app' | 'subs' | 'all' }): Promise<Subscription[]>
  export function requestPurchase(input: {
    type: 'subs' | 'in-app'
    request: {
      google?: {
        skus: string[]
        subscriptionOffers?: Array<{ sku: string; offerToken: string }>
      }
    }
  }): Promise<void>
  export function getAvailablePurchases(input?: { includeSuspendedAndroid?: boolean }): Promise<Purchase[]>
  export function finishTransaction(input: { purchase: Purchase; isConsumable?: boolean } | Purchase, isConsumable?: boolean): Promise<void>
  export function purchaseUpdatedListener(listener: (purchase: Purchase) => void): { remove: () => void }
  export function purchaseErrorListener(listener: (error: PurchaseError) => void): { remove: () => void }
}
