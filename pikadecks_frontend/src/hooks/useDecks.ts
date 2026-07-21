import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import { useOfflineAuthUser } from '@/lib/offline-auth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { DeckRepository } from '@/lib/deck-repository';

export function useDecks() {
  const { userId, getToken, isSignedIn } = useAuth();
  const { offlineUserId } = useOfflineAuthUser();
  const { isOnline } = useNetworkStatus();
  const effectiveUserId = userId ?? offlineUserId;

  return useQuery({
    queryKey: ['decks', effectiveUserId],
    queryFn: () => DeckRepository.getDecks(getToken, isOnline, effectiveUserId),
    enabled: (isSignedIn && isOnline && !!userId) || (!isOnline && !!offlineUserId),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}
