import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import {
  refreshSubscriptionStatus,
  getCurrentSubscriptionStatus,
  type SubscriptionStatus,
} from '@/lib/billing'
import { addBreadcrumb, captureException } from '@/lib/errors'

type TokenGetter = () => Promise<string | null>

export function useSubscriptionStatus(getToken: TokenGetter, refreshOnMount = true) {
  const queryClient = useQueryClient()
  
  const query = useQuery<SubscriptionStatus>({
    queryKey: ['subscription-status'],
    queryFn: async () => {
      try {
        const latest = await refreshSubscriptionStatus(getToken)
        addBreadcrumb('Subscription status refreshed', {
          is_pro: latest.is_pro,
          plan: latest.plan,
          subscription_status: latest.subscription?.status,
        }, 'billing')
        return latest
      } catch (error) {
        captureException(error, { feature: 'billing', action: 'useSubscriptionStatus_fetch' })
        throw error
      }
    },
    initialData: () => getCurrentSubscriptionStatus() || undefined,
    refetchOnMount: refreshOnMount,
    refetchOnWindowFocus: true,
    staleTime: 60 * 1000, // 1 minute stale time
  })

  const refresh = useCallback(async () => {
    try {
      const latest = await queryClient.fetchQuery<SubscriptionStatus>({
        queryKey: ['subscription-status'],
        queryFn: async () => refreshSubscriptionStatus(getToken),
      })
      return latest
    } catch (error) {
      captureException(error, { feature: 'billing', action: 'useSubscriptionStatus_refresh' })
      throw error
    }
  }, [getToken, queryClient])

  return {
    status: query.data ?? null,
    loading: query.isLoading || query.isFetching,
    refresh,
  }
}
