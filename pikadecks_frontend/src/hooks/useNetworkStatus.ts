import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const subscription = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected === true && state.isInternetReachable !== false);
    });

    void NetInfo.fetch().then((state) => {
      setIsOnline(state.isConnected === true && state.isInternetReachable !== false);
    });

    return subscription;
  }, []);

  return {
    isOnline: isOnline !== false,
    isOffline: isOnline === false,
    isNetworkKnown: isOnline !== null,
  };
}
