import { AppState, Platform } from 'react-native';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(state.isConnected === true && state.isInternetReachable !== false);
  });
});

if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (status) => {
      handleFocus(status === 'active');
    });

    return () => subscription.remove();
  });
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 24 * 60 * 60 * 1000, // 30 days
      refetchOnMount: false,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false, // Prevents noisy refetches in React Native
      retry: false,
    },
  },
});

export const clientPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
});
