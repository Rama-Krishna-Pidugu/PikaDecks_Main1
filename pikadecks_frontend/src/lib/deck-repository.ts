import { queryClient } from './react-query';
import { readJsonResponse } from './api-debug';

export type SyncStatus = 'SYNCED' | 'PENDING_CREATE' | 'PENDING_UPDATE' | 'PENDING_DELETE';

export interface LocalDeck {
  deck_id: string;
  title: string;
  description?: string | null;
  thumbnail_url?: string | null;
  visibility?: string | null;
  source_pdf_url?: string | null;
  created_at?: string;
  updated_at?: string;
  notes_content?: string | null;
  notes_image_urls?: string[];
  // Sync fields
  version: number;
  last_synced_at: number;
  is_stale: boolean;
  sync_status: SyncStatus;
}

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
  deck: LocalDeck;
  cards: Card[];
  fetchedAt: number;
};

export const DeckRepository = {
  getDecks: async (
    getToken: () => Promise<string | null>,
    isOnline: boolean,
    userId: string | null
  ): Promise<LocalDeck[]> => {
    if (!isOnline) {
      // Offline mode: retrieve from React Query cache
      const cached = queryClient.getQueryData<LocalDeck[]>(['decks', userId]);
      return cached || [];
    }

    let token: string | null = null;
    try {
      token = await getToken();
    } catch {
      // Ignore token retrieval errors and fallback
    }
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;

    if (!token || !apiUrl) {
      const cached = queryClient.getQueryData<LocalDeck[]>(['decks', userId]);
      return cached || [];
    }

    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    
    try {
      const response = await fetch(`${apiUrl}/decks`, { headers });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        const cached = queryClient.getQueryData<LocalDeck[]>(['decks', userId]);
        return cached || [];
      }

      const decks: LocalDeck[] = (Array.isArray(data?.decks) ? data.decks : []).map((deck: any) => ({
        ...deck,
        version: deck.version ?? 1,
        last_synced_at: deck.last_synced_at ?? Date.now(),
        is_stale: deck.is_stale ?? false,
        sync_status: deck.sync_status ?? 'SYNCED',
      }));

      return decks;
    } catch {
      const cached = queryClient.getQueryData<LocalDeck[]>(['decks', userId]);
      return cached || [];
    }
  },

  getDeckDetail: async (
    id: string,
    getToken: () => Promise<string | null>,
    isOnline: boolean,
    userId: string | null
  ): Promise<DeckDetailResponse> => {
    if (!isOnline) {
      const cached = queryClient.getQueryData<DeckDetailResponse>(['deck', id, userId]);
      if (cached) return cached;
      throw new Error('Offline: Deck detail not in cache');
    }

    let token: string | null = null;
    try {
      token = await getToken();
    } catch {
      // Ignore token retrieval errors and fallback
    }
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;

    if (!token || !apiUrl) {
      const cached = queryClient.getQueryData<DeckDetailResponse>(['deck', id, userId]);
      if (cached) return cached;
      throw new Error('Missing authentication or API URL');
    }

    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    try {
      const [deckRes, cardsRes] = await Promise.all([
        fetch(`${apiUrl}/decks/${id}`, { headers }),
        fetch(`${apiUrl}/decks/${id}/cards`, { headers }),
      ]);

      const deckData = await readJsonResponse(deckRes);
      const cardsData = await readJsonResponse(cardsRes);

      if (!deckRes.ok) {
        const cached = queryClient.getQueryData<DeckDetailResponse>(['deck', id, userId]);
        if (cached) return cached;
        throw new Error(deckData?.detail || 'Failed to load deck detail');
      }

      const rawDeck = deckData?.deck || deckData || null;
      const deck: LocalDeck = {
        ...rawDeck,
        version: rawDeck?.version ?? 1,
        last_synced_at: rawDeck?.last_synced_at ?? Date.now(),
        is_stale: rawDeck?.is_stale ?? false,
        sync_status: rawDeck?.sync_status ?? 'SYNCED',
      };

      return {
        deck,
        cards: Array.isArray(cardsData?.cards) ? cardsData.cards : [],
        fetchedAt: Date.now(),
      };
    } catch (error) {
      const cached = queryClient.getQueryData<DeckDetailResponse>(['deck', id, userId]);
      if (cached) return cached;
      throw error;
    }
  },
};
