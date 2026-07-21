import { useAuth } from '@clerk/clerk-expo'
import { Redirect } from 'expo-router'

import { LoadingScreen } from '@/components/loading-screen'


export default function OAuthNativeCallback() {
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) {
    return <LoadingScreen message="Finishing sign in" />
  }

  return <Redirect href={isSignedIn ? '/home' : '/auth'} />
}
