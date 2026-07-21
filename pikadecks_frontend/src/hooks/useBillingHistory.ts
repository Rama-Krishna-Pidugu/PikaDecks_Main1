import { useQuery } from '@tanstack/react-query'
import { captureException } from '@/lib/errors'

type TokenGetter = () => Promise<string | null>

export type HistoryItem = {
  id: string
  provider: 'google_play' | 'razorpay'
  product_id: string
  plan_name: string
  status: string
  transaction_id: string | null
  purchase_date: string
  expiry_date: string | null
  auto_renewing: boolean
  active: boolean
  amount: number
}

export function useBillingHistory(getToken: TokenGetter) {
  return useQuery<{ history: HistoryItem[] }>({
    queryKey: ['billing-history'],
    queryFn: async () => {
      try {
        const token = await getToken()
        const apiUrl = process.env.EXPO_PUBLIC_API_URL
        if (!token || !apiUrl) throw new Error('Missing authentication or API configuration.')
        
        const response = await fetch(`${apiUrl}/billing/history`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
        
        if (!response.ok) {
          throw new Error('Failed to load subscription history.')
        }
        
        return await response.json()
      } catch (error) {
        captureException(error, { feature: 'billing', action: 'useBillingHistory_fetch' })
        throw error
      }
    },
  })
}
