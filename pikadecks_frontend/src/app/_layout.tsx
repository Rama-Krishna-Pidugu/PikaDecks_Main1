import { ClerkProvider, useAuth } from '@clerk/clerk-expo'
import { useUser } from '@clerk/clerk-expo'
import { tokenCache } from '@clerk/clerk-expo/token-cache'
import { Stack, usePathname, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import { Observe, ObserveRoot, useObserve } from 'expo-observe'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClient, clientPersister } from '@/lib/react-query'

import { AppErrorBoundary } from '@/components/app-error-boundary'
import { LoadingScreen } from '@/components/loading-screen'
import { analyticsService } from '@/lib/analytics'
import { analyticsEvents } from '@/lib/firebase'
import { clearUserContext, setUserContext } from '@/lib/errors'
import { initSentry, Sentry } from '@/lib/sentry'
import {
  saveOfflineAuthUser,
  useOfflineAuthUser,
  clearOfflineAuthUser,
} from '@/lib/offline-auth'
import { syncPendingReviews } from '@/lib/offline-review-queue'
import { DeckRepository } from '@/lib/deck-repository'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import {
  setupPushNotifications,
  teardownPushNotifications,
} from '@/lib/push-notifications'
import {
  isBillingEnabled,
  refreshSubscriptionStatus,
} from '@/lib/billing'
import { registerBackgroundNotifeeHandler } from '@/lib/notifee-handlers'

registerBackgroundNotifeeHandler(async () => {
  // In a headless background state, we might not easily have the Clerk getToken.
  // Returning null means API calls requiring auth won't fire.
  return null;
});

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!

initSentry()

if (__DEV__ && publishableKey?.startsWith('pk_test_')) {
  console.warn('PikaDecks is using the development Clerk publishable key.')
}

Observe.configure({
  integrations: {
    'expo-router': true,
  },
})

// Keep the splash screen visible while startup settles.
void SplashScreen.preventAutoHideAsync().catch(() => {
  // The native splash can already be hidden during fast reloads/dev-client starts.
})

function AuthGate() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth()
  const { user } = useUser()
  const { markInteractive } = useObserve()
  const pathname = usePathname()
  const router = useRouter()
  const { isOnline } = useNetworkStatus()
  const { offlineUserId, isOfflineAuthLoaded, setOfflineUser } = useOfflineAuthUser()
  const markedInteractive = useRef(false)
  const mountedRef = useRef(false)
  const getTokenRef = useRef(getToken)
  const [isReady, setIsReady] = useState(false)
  const [startupTimedOut, setStartupTimedOut] = useState(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    void analyticsEvents.appOpen()
  }, [])

  useEffect(() => {
    getTokenRef.current = getToken
  }, [getToken])

  const isAuthPage = pathname === '/' || pathname === '/auth'
  const isProtectedPage =
    pathname === '/home' ||
    pathname === '/decks' ||
    pathname === '/stats' ||
    pathname === '/user' ||
    pathname === '/profile' ||
    pathname === '/billing' ||
    pathname === '/upgrade-pro' ||
    pathname === '/subscription-history' ||
    pathname === '/subscription' ||
    pathname === '/purchase-success' ||
    pathname === '/upload' ||
    pathname === '/create-notes' ||
    pathname === '/create-youtube' ||
    pathname === '/sentry-test' ||
    pathname.startsWith('/deck/') ||
    pathname.startsWith('/review/')

  const isAuthResolved = isLoaded || startupTimedOut || !!offlineUserId
  const isLocallyAuthenticated = isSignedIn || (!isLoaded && !!offlineUserId)

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (mountedRef.current) {
        setStartupTimedOut(true)
      }
    }, 15000)

    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (!isOfflineAuthLoaded || !isAuthResolved) return

    if (isLocallyAuthenticated && isAuthPage) {
      router.replace('/home')
    }

    if (isLoaded && !isSignedIn && !offlineUserId && isProtectedPage) {
      router.replace('/')
    }

    // Once auth is loaded and routing is decided, hide the splash screen
    if (mountedRef.current) {
      setIsReady(true)
    }
    void SplashScreen.hideAsync().catch(() => {})
  }, [
    isAuthPage,
    isAuthResolved,
    isLoaded,
    isLocallyAuthenticated,
    isOfflineAuthLoaded,
    isProtectedPage,
    isSignedIn,
    offlineUserId,
    router,
  ])

  useEffect(() => {
    if (!isLoaded) return

    if (isSignedIn && userId) {
      void saveOfflineAuthUser(userId).then(() => {
        if (mountedRef.current) {
          setOfflineUser({ userId, savedAt: Date.now() })
        }
      })
    }
  }, [isLoaded, isSignedIn, setOfflineUser, userId])

  useEffect(() => {
    if (isLoaded && !isSignedIn && isOnline && offlineUserId) {
      void clearOfflineAuthUser().then(() => {
        if (mountedRef.current) {
          setOfflineUser(null)
        }
        void queryClient.clear()
      })
    }
  }, [isLoaded, isSignedIn, isOnline, offlineUserId, setOfflineUser])

  useEffect(() => {
    if (isOnline && isSignedIn) {
      void syncPendingReviews(getToken)
    }
  }, [getToken, isOnline, isSignedIn])

  useEffect(() => {
    if (isOnline && isSignedIn && isLoaded) {
      void setupPushNotifications({ getToken, router })
      return
    }

    teardownPushNotifications()
  }, [getToken, isLoaded, isOnline, isSignedIn, router])

  useEffect(() => {
    if (isOnline && isSignedIn && isLoaded && isBillingEnabled()) {
      void refreshSubscriptionStatus(() => getTokenRef.current()).catch((error) => {
        console.warn('[Billing] startup status failed', error)
      })
    }
  }, [isLoaded, isOnline, isSignedIn])

  useEffect(() => {
    if (isOnline && isSignedIn && isLoaded) {
      const syncUserOnStartup = async () => {
        try {
          const token = await getTokenRef.current()
          const apiUrl = process.env.EXPO_PUBLIC_API_URL
          if (!token || !apiUrl) return
          const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
          await fetch(`${apiUrl}/sync-user`, { method: 'POST', headers })

          // Prefetch and cache all decks and their card details for offline support
          const decks = await DeckRepository.getDecks(() => getTokenRef.current(), isOnline, userId)
          for (const deck of decks) {
            void queryClient.prefetchQuery({
              queryKey: ['deck', deck.deck_id, userId],
              queryFn: () => DeckRepository.getDeckDetail(deck.deck_id, () => getTokenRef.current(), isOnline, userId),
              staleTime: 30 * 1000,
            })
          }
        } catch (error) {
          console.warn('[User Sync] startup sync failed', error)
        }
      }
      void syncUserOnStartup()
    }
  }, [isLoaded, isOnline, isSignedIn, userId])

  // Track screen views
  useEffect(() => {
    if (isReady && pathname) {
      void analyticsService.logScreenView(pathname);
    }
  }, [pathname, isReady]);

  useEffect(() => {
    if (userId) {
      void analyticsService.setUserId(userId);
      setUserContext({
        id: userId,
        email: user?.primaryEmailAddress?.emailAddress,
        username: user?.username,
      })
    } else if (isLoaded && !isSignedIn) {
      clearUserContext()
    }
  }, [isLoaded, isSignedIn, user, userId]);

  useEffect(() => {
    if (markedInteractive.current || !isReady || (!isLoaded && !startupTimedOut)) {
      return
    }

    markedInteractive.current = true
    markInteractive()
  }, [isLoaded, isReady, markInteractive, startupTimedOut])

  const showStartupOverlay =
    !isReady || !isOfflineAuthLoaded || (!isLoaded && !startupTimedOut && !offlineUserId)

  return (
    <View style={styles.root}>
      <Stack screenOptions={{ headerShown: false }} />
      {showStartupOverlay ? (
        <View style={styles.overlay}>
          <LoadingScreen
            message={isOnline ? 'Loading PikaDecks' : 'Opening offline mode'}
          />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
  },
})

import { ToastProvider } from '@/components/ui/ToastProvider'

function RootLayout() {
  return (
    <AppErrorBoundary>
      <ToastProvider>
        <ObserveRoot>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister: clientPersister }}
          >
            <ClerkProvider
              publishableKey={publishableKey}
              tokenCache={tokenCache}
            >
              <AuthGate />
            </ClerkProvider>
          </PersistQueryClientProvider>
        </ObserveRoot>
      </ToastProvider>
    </AppErrorBoundary>
  )
}

export default Sentry.wrap(RootLayout)
