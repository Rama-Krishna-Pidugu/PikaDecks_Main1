export type CardWithImages = {
  card_id: string;
  image_url?: string | null;
  notes_image_url?: string | null;
  [key: string]: any;
};

class ImageRefreshManager {
  private inFlight = new Map<string, Promise<void>>();

  /**
   * Refreshes the image URLs for a specific deck by fetching the lightweight image-urls endpoint.
   * Modifies the `cards` array in-place or via a provided state updater to preserve non-URL state.
   */
  async refreshUrls(
    deckId: string,
    currentCards: CardWithImages[],
    setCards: (updater: (prev: CardWithImages[]) => CardWithImages[]) => void,
    getToken: () => Promise<string | null>
  ): Promise<void> {
    if (this.inFlight.has(deckId)) {
      return this.inFlight.get(deckId);
    }

    const promise = this.doRefresh(deckId, currentCards, setCards, getToken);
    this.inFlight.set(deckId, promise);

    try {
      await promise;
    } finally {
      this.inFlight.delete(deckId);
    }
  }

  private async doRefresh(
    deckId: string,
    currentCards: CardWithImages[],
    setCards: (updater: (prev: CardWithImages[]) => CardWithImages[]) => void,
    getToken: () => Promise<string | null>
  ) {
    const token = await getToken();
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!token || !apiUrl) return;

    try {
      const res = await fetch(`${apiUrl}/decks/${deckId}/cards/image-urls`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!res.ok) throw new Error('Failed to fetch refreshed image URLs');
      const data = await res.json();

      if (data?.success && Array.isArray(data.cards)) {
        const urlMap = new Map<string, { image_url?: string; notes_image_url?: string }>();
        data.cards.forEach((c: any) => {
          urlMap.set(c.card_id, {
            image_url: c.image_url,
            notes_image_url: c.notes_image_url,
          });
        });

        // Patch only the URL fields, leaving all other card properties exactly as they are
        setCards((prev) =>
          prev.map((card) => {
            const fresh = urlMap.get(card.card_id);
            if (!fresh) return card;
            return {
              ...card,
              image_url: fresh.image_url ?? card.image_url,
              notes_image_url: fresh.notes_image_url ?? card.notes_image_url,
            };
          })
        );
      }
    } catch (e) {
      console.warn('[ImageRefreshService] Failed to refresh image URLs:', e);
    }
  }
}

export const ImageRefreshService = new ImageRefreshManager();
