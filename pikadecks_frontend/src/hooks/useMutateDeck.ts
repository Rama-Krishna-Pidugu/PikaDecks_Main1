import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import { readJsonResponse } from '@/lib/api-debug';

type CreateDeckParams = {
  title: string;
  description?: string;
};

export function useMutateDeck() {
  const { userId, getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deckData: CreateDeckParams) => {
      const token = await getToken();
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;

      if (!token || !apiUrl) {
        throw new Error('Missing API URL or auth token');
      }

      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      
      const response = await fetch(`${apiUrl}/decks`, {
        method: 'POST',
        headers,
        body: JSON.stringify(deckData)
      });
      
      const data = await readJsonResponse(response);
      
      if (!response.ok) {
        throw new Error(data?.message || 'Could not create deck');
      }
      
      return data?.deck;
    },
    onSuccess: () => {
      // Invalidate and refetch all decks
      queryClient.invalidateQueries({ queryKey: ['decks'] });
    },
    // Optional Phase 2: onMutate can be added here for Optimistic Updates
  });
}
