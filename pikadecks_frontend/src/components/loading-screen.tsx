import { ActivityIndicator, Image, Text, View } from 'react-native'

import { pikaAssets } from '@/constants/assets'


type LoadingScreenProps = {
  message?: string
}

export function LoadingScreen({
  message = 'Loading PikaDecks',
}: LoadingScreenProps) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#020617',
        padding: 24,
      }}
    >
      <Image
        source={pikaAssets.appIcon}
        resizeMode="contain"
        style={{
          width: 88,
          height: 88,
          marginBottom: 18,
        }}
      />

      <Text
        style={{
          color: 'white',
          fontSize: 32,
          fontWeight: 'bold',
          marginBottom: 12,
        }}
      >
        PikaDecks
      </Text>

      <Text
        style={{
          color: '#94a3b8',
          fontSize: 15,
          marginBottom: 24,
          textAlign: 'center',
        }}
      >
        {message}
      </Text>

      <ActivityIndicator color="#6366f1" size="large" />
    </View>
  )
}
