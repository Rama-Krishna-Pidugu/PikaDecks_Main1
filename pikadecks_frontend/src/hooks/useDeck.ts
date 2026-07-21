import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import { useOfflineAuthUser } from '@/lib/offline-auth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { DeckRepository } from '@/lib/deck-repository';

export type Deck = {
  deck_id: string;
  title: string;
  description?: string | null;
};

export type Card = {
  card_id: string;
  question: string;
  answer: string;
  explanation?: string | null;
  difficulty?: string | null;
  image_url?: string | null;
  notes_image_url?: string | null;
  image_key?: string | null;
  notes_image_key?: string | null;
};

export type DeckDetailResponse = {
  deck: Deck;
  cards: Card[];
  fetchedAt: number;
};

export function useDeck(id: string) {
  const { userId, getToken, isSignedIn } = useAuth();
  const { offlineUserId } = useOfflineAuthUser();
  const { isOnline } = useNetworkStatus();
  const effectiveUserId = userId ?? offlineUserId;

  return useQuery({
    queryKey: ['deck', id, effectiveUserId],
    queryFn: () => DeckRepository.getDeckDetail(id, getToken, isOnline, effectiveUserId),
    enabled: ((isSignedIn && isOnline && !!userId) || (!isOnline && !!offlineUserId)) && !!id,
    staleTime: 30 * 1000,
  });
}
